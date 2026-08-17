# DECISIONS_ADMIN.md

## Decisões arquiteturais

### 001 — Auth por email whitelist ⛔ SUPERSEDIDA em 2026-08-17 (ver 001-b)
- **Data:** 2026-07-01
- **Decisão:** Super-admin identificado por env var `PLATFORM_ADMIN_EMAILS` (lista de emails)
- **Razão:** Simplicidade na fase 1, sem tabela extra. Evita role-based complexity.
- **Trade-off:** Não escala pra muitos admins — migrar pra tabela `platform_admins` quando necessário.

### 001-b — Auth por identidade (`platform_admins`)
- **Data:** 2026-08-17
- **Decisão:** Super-admin é `auth_user_id` na tabela `platform_admins`. E-mail deixa de ser
  critério de autorização (a coluna `email` é rótulo). Guard é **fail-closed**: sem linha, sem acesso.
- **Razão:** o trade-off da 001 não era escala, era **escalação de privilégio**. O signup cria conta
  com `email_confirm: true` sem verificar posse do endereço, então qualquer e-mail da allowlist ainda
  não cadastrado (ex.: `admin@hubflow.com.br`, que estava no `.env.production.example`) podia ser
  registrado por terceiro — que virava super-admin de ~30 rotas `/admin`. `auth_user_id` só existe
  depois da conta e não é adivinhável.
- **Trade-off:** cadastrar admin novo passa a exigir `insert` no banco, não edição de env. Aceito:
  admin de plataforma é evento raro e deve deixar rastro.
- **Passo intermediário (PR #93, 2026-08-12):** a allowlist por e-mail primeiro perdeu o default
  hardcoded `igor@hubflow.com.br` e passou a falhar fechada sem a env. Isso fechou o deploy que
  *parecia* configurado, mas não o vetor: o critério continuava sendo uma string de e-mail. Esta
  decisão troca o critério; a env `PLATFORM_ADMIN_EMAILS` deixa de ser lida pelo código.
- **Semear antes de deployar:** a tabela nasce vazia e o guard falha fechado, então o `insert` do
  primeiro admin vem ANTES do deploy que passa a ler a tabela. Recuperação, se ninguém for semeado:
  inserir a linha por SQL — o acesso volta na requisição seguinte, sem redeploy.

### 002 — Service role pra queries cross-tenant
- **Data:** 2026-07-01
- **Decisão:** Admin usa `getSupabaseAdmin()` (service_role key) pra acessar dados de todos os tenants.
- **Razão:** RLS bloqueia acesso cross-tenant por design. Admin precisa ver tudo.
- **Trade-off:** Qualquer bug no admin-guard expõe todos os dados.

### 003 — Client components separados
- **Data:** 2026-07-01
- **Decisão:** Tabelas interativas (tenants, users, logs) em components separados `*-client.tsx`.
- **Razão:** Server components nas páginas pra SSR dos dados, client components pra interatividade.
- **Trade-off:** Mais arquivos, mas separação clara de responsabilidades.

### 004 — Cor alerta (vermelho) pra admin
- **Data:** 2026-07-01
- **Decisão:** Sidebar usa cor `alerta` ao invés de `iris` pra distinguir visualmente do painel tenant.
- **Razão:** Admin não deve ser confundido com painel do lojista. Vermelho = poder + cuidado.
