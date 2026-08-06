# MedVault development rules

- Workspaces are `apps/web`, `apps/api`, `apps/worker`, and packages under `packages/`.
- Use strict TypeScript, shared Zod schemas for untrusted input, and thin HTTP handlers.
- Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before completion.
- All private data access must derive the patient from the verified Supabase identity. Never trust a client patient ID; test IDOR boundaries.
- Medical files stay in a private bucket under an authenticated-user namespace and are exposed only by short-lived signed URLs.
- Never log medical content, AI prompts/responses, tokens, credentials, or signed URLs.
- Gemini only extracts report facts. It must never diagnose, interpret, or recommend treatment.
- AI output remains untrusted until Zod validation and explicit patient verification.
- Prescriptions are stored documents only and must never enter the report-analysis queue in Phase 1.
- “Latest” means latest `reportDate`, then `createdAt`, among verified reports with the same normalized test name.
