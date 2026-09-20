# Completion workflow

Transcribed from the supplied playbook page 3; plan MV-COMPLETE-2026-09-10-v1. No companion Markdown pack was supplied.

Continuity and checkpoint rules
EX-01 through EX-10 divide remaining core product Phases 1-3. They are execution batches, not new
product phases. Future features 22-28 remain deferred; core backup and medication reminders remain
required.
Start each session
Read repository instructions, root track.md, the active phase in docs/completion/plan.md and relevant
evidence. Check branch, HEAD and working diff. Reconcile stale checkpoints locally, preserve uncommitted
work, and avoid repeating the whole audit.
Use stable subtask IDs and complete one connected task at a time. Run targeted checks; reserve full suites
for integration gates or concrete regressions. Read actual scripts/documentation before choosing
commands. Blocked dependencies prevent dependent acceptance claims, not unrelated code work.
Checkpoint continuously
After each completed subtask, before long/consequential work, and before ending, update track.md:
phase/subtask, changed files, command/cwd, observed result, evidence, pending operation, blocker and
exact next action. Record a planned command as NOT_RUN, an issued command as RUNNING, and
completion only after observing its result. An interrupted outcome stays UNKNOWN until checked.
Do not rely on predicting a usage limit. A cutoff may precede the final note. Inspect the diff and pending
process/job/migration outcome before repeating work, especially mutations. Issuing a command does not
prove success.
Status and evidence
Execution: NOT_STARTED, IN_PROGRESS, BLOCKED or VERIFIED. Track implementation, automated and live
checks separately. VERIFIED requires every phase acceptance criterion; missing device evidence or clinical
approval remains open. NOT_APPLICABLE needs an explicit reason.
Keep track.md compact; link detailed history in existing docs/IMPLEMENTATION_REVIEW.md and
docs/PHASE_PROGRESS.md. Evidence records its checkout/diff state, service/configuration alias, fixture and
date. Never include secrets or patient contents in tracking files.
Scope and authorization
Preserve local services, centralized hosted records/private files and configured Redis/Gemini. No
deployment, resets, queue flushing, unrelated deletion or optional scope expansion. Use authorized
resources. For a genuinely new cost, unapproved restore destination or consequential unresolved choice,
prepare a concrete plan before requesting the specific decision. Do not repeat already-granted approval
requests.
Preserve screening, prescription storage-only handling, ownership and medical uncertainty. Use synthetic
fixtures. Unsupported clinical rules/providers remain unavailable; software tests do not establish clinical
approval.
Phase boundary and handoff
Work only on the requested phase. On completion update next_phase and stop with a review. If blocked,
finish independent work and identify the next eligible phase for explicit selection; retain the blocker. Do not
run all ten automatically.
A phase may span sessions. Use RESUME.md after interruption. Tracking neither bypasses limits nor
restarts agents. Transfer matching code/tracking files when changing devices; Git pull excludes
uncommitted edits. No commit/push without authorization.
