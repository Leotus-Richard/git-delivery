import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const text = x => typeof x==='string' && x.trim().length>0;
const canonical = x => Array.isArray(x)?'['+x.map(canonical).join(',')+']':
  x && typeof x==='object'?'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const hash = x => crypto.createHash('sha256').update(canonical(x)).digest('hex');
const allowedTypes=new Set(['feat','fix','refactor','perf','test','docs','build','ci','chore','revert','style']);
function runGit(repo,args,optional=false) {
  const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:16*1024*1024});
  if(r.status!==0 && !optional)throw new Error(r.stderr || r.error?.message || `Git failed: ${args.join(' ')}`);
  return r;
}
const git = (repo,args) => runGit(repo,args).stdout.trim();
function approval(value) {
  return value?.approvedByRequester===true && text(value.reason) && text(value.approvalReference);
}
export function validatePolicy(p,needIdentity=false) {
  if(p?.schemaVersion!==1)throw new Error('Policy schemaVersion must be 1');
  if(!Array.isArray(p.checks) || !p.checks.length)throw new Error('Configure at least one repository-approved check');
  const ids=new Set();
  for(const c of p.checks) {
    if(!text(c.id) || !/^[a-zA-Z0-9._-]+$/.test(c.id) || ids.has(c.id) ||
        !Array.isArray(c.argv) || !c.argv.length || c.argv.some(a=>!text(a)))
      throw new Error('Checks require unique simple IDs and nonempty argv arrays');
    ids.add(c.id);
  }
  for(const key of ['files','changedLines'])
    if(!Number.isInteger(p.limits?.[key]) || p.limits[key]<1)throw new Error(`Invalid limit: ${key}`);
  if(!Number.isInteger(p.timeoutMs) || p.timeoutMs<1 || p.timeoutMs>3600000)throw new Error('timeoutMs must be 1..3600000');
  if(needIdentity) {
    const i=p.identity;
    if(i?.confirmedByRequester!==true || !text(i.confirmationReference) || !text(i.alias) ||
        !text(i.email) || !/^[^<>\s@\x00-\x1f\x7f]+@[^<>\s@\x00-\x1f\x7f]+$/.test(i.email) ||
        /[<>\x00-\x1f\x7f]/.test(i.alias) || i.alias!==i.alias.trim())
      throw new Error('Requester-confirmed alias/email and confirmationReference required');
    if(/\b(?:ai|agent|bot|harness|claude|codex|cursor|gemini|grok|perplexity|chatgpt|gpt|copilot|antigravity)\b/i.test(i.alias))
      throw new Error('Agent/harness identity is prohibited');
  }
}
export function validateMessage(message,p) {
  const errors=[],lines=message.replaceAll('\r\n','\n').trimEnd().split('\n'),subject=lines[0] ?? '';
  const m=subject.match(/^([a-z]+)(?:\(([A-Za-z0-9][A-Za-z0-9._/-]*)\))?(!)?: (.+)$/);
  if(!m || !allowedTypes.has(m[1]) || !m[4].trim())errors.push('Use type(scope): concise imperative summary');
  if(subject.length>72)errors.push('Subject exceeds 72 characters');
  if(lines[1]!=='')errors.push('Blank line required after subject');
  if(!/^Why:\s*\S.+$/m.test(message))errors.push('Why: with actual intent required');
  const expected=`Tests: passed (${p.checks.map(c=>c.id).join(', ')})`;
  if(!lines.includes(expected))errors.push(`Expected actual check IDs: ${expected}`);
  if(/^\s*co[-\s]*author(?:ed)?[-\s]*by\s*:/mi.test(message))errors.push('Co-authored-by trailers are prohibited');
  if(/\b(?:generated|written|authored|committed|assisted)\s+(?:by|with|using)\s+(?:an?\s+)?(?:ai\b|agent\b|harness\b|bot\b|claude\b|codex\b|cursor\b|gemini\b|grok\b|perplexity\b|chatgpt\b|copilot\b|antigravity\b)/i.test(message))
    errors.push('Agent/harness attribution is prohibited');
  if(m?.[3] && !/^BREAKING CHANGE:\s*\S.+$/m.test(message))errors.push('Explain the intentional breaking change');
  return {valid:!errors.length,errors};
}
function ensureNormal(repo) {
  git(repo,['rev-parse','--show-toplevel']);
  for(const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply']) {
    const file=git(repo,['rev-parse','--git-path',marker]);
    if(fs.existsSync(path.resolve(repo,file)))throw new Error(`Pending Git workflow: ${marker}`);
  }
  const hooks=runGit(repo,['config','--get','core.hooksPath'],true).stdout.trim();
  if(['/dev/null','nul','nul:'].includes(hooks.toLowerCase()))throw new Error('Hooks must not be disabled');
}
function ensureMatchedTree(repo) {
  const diff=runGit(repo,['diff','--quiet'],true);
  if(diff.status!==0)throw new Error('Unstaged tracked changes: isolate/review them, never stash automatically');
  const untracked=git(repo,['ls-files','--others','--exclude-standard','-z']);
  if(untracked)throw new Error('Untracked files: use a clean owned worktree, never remove user files');
}
function stats(repo) {
  const records=runGit(repo,['diff','--cached','--numstat','--no-renames','-z']).stdout.split('\0').filter(Boolean);
  let added=0,deleted=0,binary=0;
  for(const row of records) {
    const [a,d]=row.split('\t');
    if(a==='-' || d==='-')binary++;
    else {added+=Number(a);deleted+=Number(d);}
  }
  const paths=runGit(repo,['diff','--cached','--name-only','--no-renames','-z']).stdout.split('\0').filter(Boolean);
  return {files:paths.length,paths,added,deleted,changedLines:added+deleted,binary};
}
function state(repo,requireChanges=true) {
  ensureNormal(repo);ensureMatchedTree(repo);
  const head=runGit(repo,['rev-parse','--verify','HEAD'],true);
  const staged=runGit(repo,['diff','--cached','--quiet'],true);
  if(![0,1].includes(staged.status))throw new Error('Cannot inspect staged changes');
  if(requireChanges && staged.status===0)throw new Error('No staged changes');
  return {head:head.status===0?head.stdout.trim():null,tree:git(repo,['write-tree']),
    status:runGit(repo,['status','--porcelain=v1','-z']).stdout,stats:stats(repo)};
}
function runChecks(repo,p) {
  const records=[];
  for(const c of p.checks) {
    const startedAt=new Date().toISOString();
    const r=spawnSync(c.argv[0],c.argv.slice(1),{cwd:repo,encoding:'utf8',shell:false,timeout:p.timeoutMs,maxBuffer:2*1024*1024});
    records.push({id:c.id,argv:c.argv,startedAt,finishedAt:new Date().toISOString(),exitCode:r.status,
      signal:r.signal ?? null,error:r.error?.message ?? null,passed:r.status===0 && !r.error,
      stdout:(r.stdout ?? '').slice(-8192),stderr:(r.stderr ?? '').slice(-8192)});
    if(!records.at(-1).passed)break;
  }
  return records;
}
function ensureReceiptTarget(repo,filename) {
  const target=path.resolve(filename),top=fs.realpathSync.native(git(repo,['rev-parse','--show-toplevel'])),
    metadata=fs.realpathSync.native(git(repo,['rev-parse','--absolute-git-dir']));
  const inside=(p,d)=>p===d || p.startsWith(d+path.sep);
  // Resolve the parent so a symlink cannot turn an external receipt into an untracked project file.
  const parent=fs.realpathSync.native(path.dirname(target)),effective=path.join(parent,path.basename(target));
  if(inside(effective,top) && !inside(effective,metadata))throw new Error('Receipt must be outside the worktree or inside Git metadata');
  if(fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())throw new Error('Receipt symlink refused');
}
export function verify(repo,p,receiptPath) {
  validatePolicy(p);
  const before=state(repo);
  ensureReceiptTarget(repo,receiptPath);
  const repository=fs.realpathSync.native(git(repo,['rev-parse','--show-toplevel']));
  const checks=runChecks(repo,p);
  let after=null,repositoryError=null;
  try {after=state(repo);}catch(e){repositoryError=e.message;}
  const unchanged=!repositoryError && canonical(before)===canonical(after);
  const receipt={schemaVersion:1,repo:repository,
    policyHash:hash(p),testedHead:before.head,testedTree:before.tree,stats:before.stats,
    checks,passed:unchanged && checks.length===p.checks.length && checks.every(c=>c.passed),
    repositoryUnchanged:unchanged,repositoryError,finishedAt:new Date().toISOString(),
    limitation:'Local observed test evidence; not cryptographic attestation, hermeticity proof or commit authorization.'};
  fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');
  return receipt;
}
function requireReceipt(repo,p,r) {
  if(r?.schemaVersion!==1 || !r.passed || !r.repositoryUnchanged || r.policyHash!==hash(p) ||
      r.repo!==fs.realpathSync.native(git(repo,['rev-parse','--show-toplevel'])) ||
      !Array.isArray(r.checks) || r.checks.length!==p.checks.length)
    throw new Error('Missing, failing or incompatible test receipt');
  for(let i=0;i<p.checks.length;i++)
    if(!r.checks[i].passed || r.checks[i].exitCode!==0 ||
        r.checks[i].id!==p.checks[i].id || canonical(r.checks[i].argv)!==canonical(p.checks[i].argv))
      throw new Error('Receipt does not match configured checks');
}
export function preflight(repo,p,r,message,messagePath) {
  validatePolicy(p,true);requireReceipt(repo,p,r);
  const now=state(repo);
  if(now.head!==r.testedHead || now.tree!==r.testedTree)throw new Error('Stale receipt: HEAD/index changed; retest the exact tree');
  const check=validateMessage(message,p);
  if(!check.valid)throw new Error(check.errors.join('\n'));
  if((now.stats.files>p.limits.files || now.stats.changedLines>p.limits.changedLines) && !approval(p.sizeException))
    throw new Error('Large slice: split or obtain a documented requester-approved size exception');
  if(now.stats.binary && !approval(p.binaryReview))throw new Error('Binary changes require documented requester-approved review');
  return {passed:true,mode:'proposed-local-commit-only',testedHead:r.testedHead,testedTree:r.testedTree,stats:now.stats,
    authorization:'Commit only after scope and any host-required approval; no approval is inferred from this result.',
    invocation:{cwd:repo,argv:['git','-c',`user.name=${p.identity.alias}`,'-c',`user.email=${p.identity.email}`,
      '-c','user.useConfigOnly=true','commit','-F',path.resolve(messagePath)],
      env:{GIT_AUTHOR_NAME:p.identity.alias,GIT_AUTHOR_EMAIL:p.identity.email,
        GIT_COMMITTER_NAME:p.identity.alias,GIT_COMMITTER_EMAIL:p.identity.email}},
    pushes:false,historyRewrites:false,commitExecuted:false};
}
export function audit(repo,p,r) {
  validatePolicy(p,true);requireReceipt(repo,p,r);
  const before=state(repo,false);
  if(before.status)throw new Error('Post-commit audit requires a clean index and worktree');
  const parents=git(repo,['rev-list','--parents','-n','1','HEAD']).split(' ');
  const expected=r.testedHead?[r.testedHead]:[];
  if(canonical(parents.slice(1))!==canonical(expected))throw new Error('Actual commit parent differs from tested HEAD');
  if(git(repo,['rev-parse','HEAD^{tree}'])!==r.testedTree)throw new Error('Actual commit tree differs from tested index');
  const info=runGit(repo,['log','-1','--format=%an%x00%ae%x00%cn%x00%ce%x00%B']).stdout.split('\0');
  if(info[0]!==p.identity.alias || info[1]!==p.identity.email || info[2]!==p.identity.alias || info[3]!==p.identity.email)
    throw new Error('Actual author/committer does not match confirmed requester');
  const message=validateMessage(info.slice(4).join('\0'),p);
  if(!message.valid)throw new Error(message.errors.join('\n'));
  const checks=runChecks(repo,p);
  let after=null,repositoryError=null;
  try {after=state(repo,false);}catch(e){repositoryError=e.message;}
  const passed=!repositoryError && canonical(before)===canonical(after) &&
    checks.length===p.checks.length && checks.every(c=>c.passed);
  return {passed,sha:parents[0],tree:r.testedTree,identityVerified:true,checks,
    nextDependentSliceAllowed:passed,repositoryError,historyModified:false,pushed:false};
}
export function main(args) {
  const command=args[0],flags={};
  if(!['verify','preflight','audit'].includes(command))throw new Error('Use verify, preflight or audit');
  for(let i=1;i<args.length;i+=2) {
    if(!['--repo','--policy','--receipt','--message'].includes(args[i]) || !args[i+1])throw new Error('Invalid argument');
    flags[args[i].slice(2)]=args[i+1];
  }
  for(const name of ['repo','policy','receipt'])if(!flags[name])throw new Error(`--${name} required`);
  const repo=path.resolve(flags.repo),p=JSON.parse(fs.readFileSync(flags.policy,'utf8'));
  let result;
  if(command==='verify')result=verify(repo,p,flags.receipt);
  else {
    const r=JSON.parse(fs.readFileSync(flags.receipt,'utf8'));
    if(command==='preflight') {
      if(!flags.message)throw new Error('--message required');
      result=preflight(repo,p,r,fs.readFileSync(flags.message,'utf8'),flags.message);
    } else result=audit(repo,p,r);
  }
  console.log(JSON.stringify(result,null,2));
  if(!result.passed)process.exitCode=1;
}
if(process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}
}
