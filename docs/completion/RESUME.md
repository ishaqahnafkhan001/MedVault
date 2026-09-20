# Resume MedVault completion

Transcribed from the supplied playbook page 14.

Universal resume prompt
Copy this after an interruption or usage-limit reset. It resumes the recorded active phase rather than starting a new
full audit.
START OF RESUME PROMPT
Resume the existing MedVault task from root track.md.
Read AGENTS.md, docs/completion/WORKFLOW.md, the active phase in docs/completion/plan.md, and only
the linked evidence relevant to the next subtask. Compare the checkpoint with the current branch/HEAD,
Git status/diff and any pending command/job/migration state. Preserve existing edits. Reconcile a stale
checkpoint locally instead of restarting the whole audit.
Continue only the active incomplete phase from its recorded next action. Do not redo verified subtasks
unless a relevant code/configuration change invalidates their evidence. If an interrupted mutation has
unknown outcome, inspect its result before attempting it again. If the phase is blocked, complete its
independent work and state the exact remaining dependency; do not silently jump to another phase. If the
recorded phase is already VERIFIED, report the next phase to run rather than inventing unfinished work.
Checkpoint after every completed subtask and before long or consequential operations. Record actual test
results, changed files, blockers and the next action. Never claim automatic continuation beyond a usage
limit. End with a short change/evidence review and an updated track.md.
END OF RESUME PROMPT
Starting the next phase
When the current phase is VERIFIED, paste the next numbered prompt. If it is BLOCKED, choose only a
phase whose dependencies allow independent progress and keep the unresolved item in track.md.
Never change BLOCKED to VERIFIED merely to move forward.
