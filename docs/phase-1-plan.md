# Phase 1 implementation plan

1. Establish the pnpm/Turborepo foundation and environment contract.
2. Define the PostgreSQL/Prisma model, shared schemas, and deterministic medical rules.
3. Implement Supabase bearer authentication, profile APIs, private uploads, and strict ownership.
4. Add the BullMQ lifecycle and Gemini structured extraction adapter.
5. Add patient correction/verification, verified-only latest selection, pagination, search, and filters.
6. Build the responsive authentication, onboarding, dashboard, document, report review, and profile pages.
7. Add privacy-safe Sentry handling, rate limiting, headers, error normalization, and security tests.
8. Run format, lint, typecheck, tests, Prisma validation, production builds, and a final privacy review.

No Phase 2 features are included. In particular, Phase 1 performs no diagnosis, interpretation, treatment recommendation, multi-report clinical comparison, medicine management, doctor workflows, sharing, appointments, wearables, or payments.
