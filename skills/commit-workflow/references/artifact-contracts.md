# Optional artifact contracts and standalone fallbacks

- **Clarification/specification:** state inputs, required outputs, acceptance cases and unknown decisions directly. Interview only for material missing information. A separate interview or requirements plugin is optional.
- **Domain/architecture:** define entities, invariants, trust boundaries, module responsibilities and interfaces in the requested artifact. No architecture plugin is required.
- **Work tracking:** preserve existing IDs if supplied. Otherwise write local Markdown tasks with inputs, outputs, acceptance, owner-or-unknown, state, evidence and actual blockers. Do not create remote tickets or require a graph compiler from another plugin. The work-tracking package bundles its own optional compiler.
- **Verification:** describe and run the relevant task-authorized checks with available tooling, report commands/results and limitations, and avoid tests that merely mirror implementation. No test, explanation or benchmark plugin is required.
- **Review:** use a separate logical pass with evidence-linked findings and label it self-review. Independent review requires an actually available and authorized reviewer.
- **Git:** provide reviewed local changes and actual verification evidence. If commits are included in task authority, follow repository policy with native Git; a delivery plugin is optional. Never infer push or history rewrite authority.
- **LLM/ML evaluation:** specify cases, dataset versions, metric definitions, baseline, variance and pass thresholds; record actual results separately from plans. Do not require an external evaluation service or sibling skill.

Consume only artifacts relevant to the selected task. A companion's name in a source example does not imply installation, execution order, approval, or automatic delegation.
