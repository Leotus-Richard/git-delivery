import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {verify,preflight,audit,validatePolicy,validateMessage} from './commit-gate.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'commit-policy-fixtures-')),cases=[];
const identity={alias:'Requester Fixture',email:'requester@example.invalid',confirmedByRequester:true,confirmationReference:'synthetic-fixture-only'};
const baseEnv={...process.env,HOME:temp,GIT_CONFIG_NOSYSTEM:'1',
  GIT_AUTHOR_NAME:identity.alias,GIT_AUTHOR_EMAIL:identity.email,GIT_COMMITTER_NAME:identity.alias,GIT_COMMITTER_EMAIL:identity.email};
const message='fix(example): increment the tested value\n\nWhy: exercise a small green checkpoint\nTests: passed (unit, syntax)\nWork-Item: SYNTHETIC-1\n';
function fixture() {
  const home=fs.mkdtempSync(path.join(temp,'case-')),repo=path.join(home,'repo');
  fs.mkdirSync(repo);
  const git=(args,env={})=>{
    const r=spawnSync('git',['-C',repo,...args],{encoding:'utf8',env:{...baseEnv,...env}});
    assert.equal(r.status,0,r.stderr);return r.stdout.trim();
  };
  git(['init','-q']);
  git(['config','user.name',identity.alias]);git(['config','user.email',identity.email]);
  git(['config','commit.gpgsign','false']);
  fs.writeFileSync(path.join(repo,'feature.mjs'),'export const value = 1;\n');
  git(['add','feature.mjs']);git(['commit','-q','-m','seed fixture']);
  fs.writeFileSync(path.join(repo,'feature.mjs'),'export const value = 2;\n');
  git(['add','feature.mjs']);
  const policy={schemaVersion:1,identity:{...identity},limits:{files:10,changedLines:300},
    sizeException:null,binaryReview:null,timeoutMs:5000,
    checks:[{id:'unit',argv:[process.execPath,'-e',"const fs=require('fs');if(!fs.readFileSync('feature.mjs','utf8').includes('value = 2'))process.exit(1)"]},
      {id:'syntax',argv:[process.execPath,'--check','feature.mjs']}]};
  const receiptPath=path.join(home,'receipt.json'),messagePath=path.join(home,'message.txt');
  fs.writeFileSync(messagePath,message);
  return {repo,policy,receiptPath,messagePath,git,home};
}
function test(name,fn) {fn();cases.push({case:name,passed:true});}
try {
  test('template-requires-real-project-checks-and-confirmed-identity',()=>{
    assert.throws(()=>validatePolicy({schemaVersion:1,checks:[]}),/Configure/);
    const f=fixture();f.policy.identity.confirmedByRequester=false;
    assert.throws(()=>validatePolicy(f.policy,true),/Requester-confirmed/);
  });
  test('agent-alias-is-not-a-fallback',()=>{
    const f=fixture();f.policy.identity.alias='Claude Code';
    assert.throws(()=>validatePolicy(f.policy,true),/prohibited/);
  });
  test('control-characters-in-identity-rejected',()=>{
    const f=fixture();f.policy.identity.alias='Requester\u0000Fixture';
    assert.throws(()=>validatePolicy(f.policy,true),/Requester-confirmed/);
  });
  test('message-requires-structure-intent-and-actual-check-ids',()=>{
    const f=fixture();assert.equal(validateMessage(message,f.policy).valid,true);
    for(const bad of ['done',message.replace('Why:','Reason:'),message.replace('unit, syntax','all tests')])
      assert.equal(validateMessage(bad,f.policy).valid,false);
  });
  test('coauthor-trailers-case-and-spacing-rejected',()=>{
    const f=fixture();
    for(const trailer of ['Co-authored-by: Fixture <x@example.invalid>','co-AUTHORED-by: Fixture','Co Authored By: Fixture'])
      assert.equal(validateMessage(message+'\n'+trailer,f.policy).valid,false);
  });
  test('harness-credit-rejected',()=>{
    const f=fixture();assert.equal(validateMessage(message+'\nGenerated with Codex\n',f.policy).valid,false);
  });
  test('breaking-change-must-be-explained',()=>{
    const f=fixture(),m=message.replace('fix(example):','feat(example)!:');
    assert.equal(validateMessage(m,f.policy).valid,false);
    assert.equal(validateMessage(m+'\nBREAKING CHANGE: change the public value contract\n',f.policy).valid,true);
  });
  test('verify-records-green-exact-tree-without-commit',()=>{
    const f=fixture(),before=f.git(['rev-parse','HEAD']),r=verify(f.repo,f.policy,f.receiptPath);
    assert.equal(r.passed,true);assert.equal(r.checks.length,2);
    assert.equal(f.git(['rev-parse','HEAD']),before);
    assert.equal(r.testedTree,f.git(['write-tree']));
  });
  test('preflight-scopes-both-identities-and-does-not-execute',()=>{
    const f=fixture(),r=verify(f.repo,f.policy,f.receiptPath),before=f.git(['rev-parse','HEAD']);
    const plan=preflight(f.repo,f.policy,r,message,f.messagePath);
    assert.equal(plan.commitExecuted,false);
    assert.equal(plan.invocation.env.GIT_AUTHOR_NAME,identity.alias);
    assert.equal(plan.invocation.env.GIT_COMMITTER_NAME,identity.alias);
    assert(!plan.invocation.argv.includes('--no-verify'));
    assert.equal(f.git(['rev-parse','HEAD']),before);
  });
  test('failing-check-blocks-commit-and-further-checks',()=>{
    const f=fixture();f.policy.checks[0].argv=[process.execPath,'-e','process.exit(1)'];
    const r=verify(f.repo,f.policy,f.receiptPath);assert.equal(r.passed,false);assert.equal(r.checks.length,1);
    assert.throws(()=>preflight(f.repo,f.policy,r,message,f.messagePath),/receipt/);
  });
  test('timeout-is-failure-not-pass',()=>{
    const f=fixture();f.policy.timeoutMs=50;f.policy.checks[0].argv=[process.execPath,'-e','setTimeout(()=>{},5000)'];
    assert.equal(verify(f.repo,f.policy,f.receiptPath).passed,false);
  });
  test('mixed-tracked-tree-refused-without-stash',()=>{
    const f=fixture();fs.appendFileSync(path.join(f.repo,'feature.mjs'),'// unrelated\n');
    assert.throws(()=>verify(f.repo,f.policy,f.receiptPath),/Unstaged/);
    assert(fs.readFileSync(path.join(f.repo,'feature.mjs'),'utf8').includes('unrelated'));
  });
  test('untracked-user-file-preserved-and-blocked',()=>{
    const f=fixture();fs.writeFileSync(path.join(f.repo,'notes.txt'),'user data');
    assert.throws(()=>verify(f.repo,f.policy,f.receiptPath),/Untracked/);
    assert.equal(fs.readFileSync(path.join(f.repo,'notes.txt'),'utf8'),'user data');
  });
  test('receipt-cannot-pollute-the-worktree',()=>{
    const f=fixture();assert.throws(()=>verify(f.repo,f.policy,path.join(f.repo,'receipt.json')),/outside/);
  });
  test('changed-index-invalidates-test-evidence',()=>{
    const f=fixture(),r=verify(f.repo,f.policy,f.receiptPath);
    fs.appendFileSync(path.join(f.repo,'feature.mjs'),'// another change\n');f.git(['add','feature.mjs']);
    assert.throws(()=>preflight(f.repo,f.policy,r,message,f.messagePath),/Stale/);
  });
  test('changed-policy-invalidates-receipt',()=>{
    const f=fixture(),r=verify(f.repo,f.policy,f.receiptPath);f.policy.limits.files=11;
    assert.throws(()=>preflight(f.repo,f.policy,r,message,f.messagePath),/receipt/);
  });
  test('check-induced-tree-drift-recorded-as-failure',()=>{
    const f=fixture();
    f.policy.checks[0].argv=[process.execPath,'-e',"require('fs').appendFileSync('feature.mjs','// unexpected drift\\n')"];
    const r=verify(f.repo,f.policy,f.receiptPath);
    assert.equal(r.passed,false);assert.equal(r.repositoryUnchanged,false);
    assert(r.repositoryError.includes('Unstaged'));
    assert.equal(JSON.parse(fs.readFileSync(f.receiptPath,'utf8')).passed,false);
  });
  test('large-slice-blocked-and-approved-exception-explicit',()=>{
    const f=fixture();f.policy.limits.changedLines=1;
    let r=verify(f.repo,f.policy,f.receiptPath);
    assert.throws(()=>preflight(f.repo,f.policy,r,message,f.messagePath),/Large slice/);
    f.policy.sizeException={reason:'synthetic inseparable change',approvalReference:'synthetic-fixture',approvedByRequester:true};
    r=verify(f.repo,f.policy,f.receiptPath);
    assert.equal(preflight(f.repo,f.policy,r,message,f.messagePath).passed,true);
  });
  test('binary-changes-require-reviewed-evidence',()=>{
    const f=fixture();fs.writeFileSync(path.join(f.repo,'sample.bin'),Buffer.from([0,1,2,0]));f.git(['add','sample.bin']);
    let r=verify(f.repo,f.policy,f.receiptPath);
    assert.throws(()=>preflight(f.repo,f.policy,r,message,f.messagePath),/Binary/);
    f.policy.binaryReview={reason:'synthetic binary checked',approvalReference:'synthetic-fixture',approvedByRequester:true};
    r=verify(f.repo,f.policy,f.receiptPath);
    assert.equal(preflight(f.repo,f.policy,r,message,f.messagePath).passed,true);
  });
  test('disabled-hooks-blocked',()=>{
    const f=fixture();f.git(['config','core.hooksPath','/dev/null']);
    assert.throws(()=>verify(f.repo,f.policy,f.receiptPath),/Hooks/);
  });
  test('pending-merge-blocked',()=>{
    const f=fixture();fs.writeFileSync(path.join(f.repo,'.git','MERGE_HEAD'),f.git(['rev-parse','HEAD']));
    assert.throws(()=>verify(f.repo,f.policy,f.receiptPath),/Pending Git workflow/);
  });
  test('actual-synthetic-commit-audited-and-retested',()=>{
    const f=fixture(),r=verify(f.repo,f.policy,f.receiptPath),plan=preflight(f.repo,f.policy,r,message,f.messagePath);
    const result=spawnSync(plan.invocation.argv[0],plan.invocation.argv.slice(1),
      {cwd:f.repo,encoding:'utf8',env:{...baseEnv,...plan.invocation.env}});
    assert.equal(result.status,0,result.stderr);
    const actual=audit(f.repo,f.policy,r);
    assert.equal(actual.passed,true);assert.equal(actual.nextDependentSliceAllowed,true);
    assert.equal(actual.checks.length,2);assert.equal(actual.historyModified,false);
  });
  test('wrong-committer-detected-after-commit',()=>{
    const f=fixture(),r=verify(f.repo,f.policy,f.receiptPath);
    f.git(['commit','-q','-F',f.messagePath],{GIT_COMMITTER_NAME:'Different Fixture'});
    assert.throws(()=>audit(f.repo,f.policy,r),/author\/committer/);
  });
  test('hook-tree-drift-detected-after-commit',()=>{
    const f=fixture(),r=verify(f.repo,f.policy,f.receiptPath);
    fs.appendFileSync(path.join(f.repo,'feature.mjs'),'// hook-like drift\n');f.git(['add','feature.mjs']);
    f.git(['commit','-q','-F',f.messagePath]);
    assert.throws(()=>audit(f.repo,f.policy,r),/tree differs/);
  });
  test('post-commit-red-blocks-dependent-work',()=>{
    const f=fixture(),marker=path.join(f.home,'allow-check');
    fs.writeFileSync(marker,'yes');
    f.policy.checks[0].argv=[process.execPath,'-e',`if(!require('fs').existsSync(${JSON.stringify(marker)}))process.exit(1)`];
    const r=verify(f.repo,f.policy,f.receiptPath);f.git(['commit','-q','-F',f.messagePath]);fs.unlinkSync(marker);
    const actual=audit(f.repo,f.policy,r);
    assert.equal(actual.passed,false);assert.equal(actual.nextDependentSliceAllowed,false);
  });
  console.log(JSON.stringify({passed:true,cases,syntheticRepositoriesOnly:true,realRequesterCommits:0,networkCalls:0},null,2));
} finally {fs.rmSync(temp,{recursive:true,force:true});}
