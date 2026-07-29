# DECISIONS

- ~~**Engine**: Baileys direto (não Evolution/Cloud API). Cloud API não permite broadcast em grupo.~~
  **SUPERADA em 2026-07-13** pelo Sprint 5 (migração Baileys → Evolution API v2, ver `TASK_PROGRESS.md`).
  O motivo original vale só para a *Cloud API* da Meta; a Evolution é Baileys por baixo e faz broadcast
  em grupo — comprovado no smoke da F1 (26/07, envio funcionando em `wa.girumo.com.br`).
- **Público**: lojista acessa direto → produto self-service multi-tenant. Assinatura à parte.
- **Rastreio**: Caminho A (link encurtado, atribuição estimada). Não Click-to-WhatsApp por ora.
- **Meta Ads**: kit de campanha manual (sem App Review por ora).
- **Sem IA**: modelos prontos curados.
- **Anti-ban**: só controles seguros (warmup, rate, delay, monitor). Recusado: fingerprint, proxy,
  stealth, legitimacySignalInjector, contentVariator, humanEntropy, banRecovery, reputationVoucher.
  Detalhe em `../../devzap-engine/DECISIONS.md`.
- **Persistência atual**: arquivo (links.json/clicks.ndjson). Migrar p/ Postgres depois.
- **Build order**: frontend-first (mock) → 1ª peça real = link tracker → engine PoC.
