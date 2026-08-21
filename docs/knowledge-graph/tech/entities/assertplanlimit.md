# AssertPlanLimit

**Type:** method

A helper function that checks tenant capability limits against plans and subscriptions.<SEP>A function that checks plan limits but suffers from a TOCTOU vulnerability due to lacking a transaction or lock.<SEP>A validation layer verifying tenant identifiers and capabilities against plan limits.

## Neighbors
- [[supabase|Supabase]]
- [[stripe|Stripe]]
- [[essencial|Essencial]]
- [[growth|Growth]]
- [[performance-max|Performance Max]]
- [[free|FREE]]

## Appears in
- `docs » FASE_5_STRIPE.md`
- `BACKEND_AUDIT.md`
- `docs » FASE_2_PLANO_DE_MIGRACAO.md`
