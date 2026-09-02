# Handoff — Configurações da campanha, PR A (Entrada) — 02/09/2026

> **PR A: FECHADO.** Mergeado em [#226](https://github.com/codingB0y/Girumo/pull/226) (squash
> `8df0888b`), branch remota apagada. CI verde nos sete checks (verify, drift, advisors, e2e e as
> três da Vercel). Card `campanhas-config-entrada` em `no_ar_nao_verificado` — falta só a prova
> em produção (abrir o `/r/<slug>` real no celular e ver o app abrir, e um chip mudar após salvar).
>
> **Próximo:** PR B (Integrações). Plano escrito em
> `docs/superpowers/plans/2026-09-02-config-campanha-integracoes.md`, ainda **não** implementado.

## Prompt para retomar o PR B (cole numa sessão nova)

```
Implementar o PR B das configurações da campanha (aba Integrações). Leia primeiro, nesta ordem:
- docs/superpowers/plans/2026-09-02-config-campanha-integracoes.md (o plano — Tasks 0 a 10)
- docs/superpowers/specs/2026-09-02-config-grupos-campanha-design.md (decisões D5, D6 e a
  seção "API de Conversões")
- docs/handoff-2026-09-02-config-campanha.md (este arquivo)
- memória: config-grupos-campanha-proposta, pattern-e2e-contraste-api-x-tela,
  finding-classificador-bloqueia-merge-e-ddl

Contexto operacional:
- Worktree: C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\config-grupos-campanha.
  Entrar com EnterWorktree(path). Branch nova a partir de origin/main:
  feat/config-campanha-integracoes (Task 0 do plano). O cwd do Bash reseta: usar git -C "$W"
  e caminhos absolutos.
- node_modules já ligados por junction (raiz e apps/web). apps/web/.env.local já copiado.
  NÃO rodar npm install.
- Sem migração: tudo em campaign_groups.metadata.settings.integracoes.
- `gh` e `git push` podem ser recusados pelo classificador na ferramenta Bash — rodar os
  mesmos comandos pela ferramenta PowerShell.
- Criar o card campanhas-config-integracoes em em_construcao ANTES de começar (Task 10 Step 6).

Executar o plano task a task (superpowers:subagent-driven-development ou executing-plans),
e fechar o loop na mesma sessão: gate local → push → PR → CI verde → merge → quadro.
```

## Estado do PR A quando fechou

- Verificado localmente antes do push: suíte 815 testes / 0 falhas / 6 skip, `tsc` web + worker,
  lint limpo, `verify-local.ps1` com "Verificacao local concluida com sucesso.", E2E
  `painel-campanha-entrada.spec.ts` (2 rodadas), smoke do `/r/grade-verao` (iPhone → tela +
  cookie + `whatsapp://`; desktop → 302; cookie de grupo não-admin ignorado).
- **Rebase antes do gate:** `main` tinha avançado com #225 (Páginas v3 Fase 2), que mexeu em
  `deploy/supabase/schema-baseline.json`. Sem o rebase, o gate de drift compararia a produção
  contra o baseline **antigo** desta branch e quebraria. Arquivos disjuntos, rebase limpo.

## O que foi entregue (commits em `feat/config-campanha-entrada`)

| Commit | O quê |
|---|---|
| 88297d9c | spec `2026-09-02-config-grupos-campanha-design.md` (D1–D11 aprovadas) |
| 898f17b6 | plano `2026-09-02-config-campanha-entrada.md` (PR A) |
| 2b8644d2 | `lib/campaigns/settings.ts` — leitura tolerante, patch estrito (zod 4), merge, encerramento |
| e0acf0db | `lib/links/deep-link.ts` — `whatsapp://chat?code=`, UA mobile, cookie `gr_<id>` |
| 37b0f9d8 | `resolve-click-target.ts` — grupo lembrado vence lotado, motivo `closed`, `groupName` |
| fc3c53f0 | `lib/campaigns/entry-page.ts` — tela de entrada (600 ms + botão), tela de aviso, `lotadoRedirect` |
| 57bb1357 | `/r/[slug]/route.ts` — settings, cookie, deep link, destino de lotado |
| a4087cfd | `/api/campanhas` — `settings.entrada` no GET/POST/PATCH; página só se publicada do tenant |
| b84686b6 | UI: aba Entrada (`entrada-form.tsx`), chips, "Configurar", QR (`qr-link.tsx`), Ajuda (`ajuda-painel.tsx`) |
| b8a839a3 | E2E `painel-campanha-entrada.spec.ts` (contraste API × tela) |
| 00eb69e7 | fix: diálogo do QR fecha com Esc (achado da captura visual) |

Sem migração: tudo em `campaign_groups.metadata.settings.entrada`.

## Achados desta sessão que não estão no código

- **Seed de dev corrigido:** `campaign_groups.group_ids` de `grade-verao` passou de UUIDs para
  `['120363001@g.us','120363003@g.us']` (ids do WhatsApp, como em prod). Antes, a campanha
  não resolvia grupo nenhum em dev. `120363001@g.us` é admin, tem convite e está a 94,5 %.
- **`useSearchParams` evitado de propósito** no `campaign-config.tsx`: exigiria Suspense na
  página pré-renderizada. `?aba=entrada` é lido de `window.location.search` no effect, o
  mesmo padrão do modo criar.
- **Prévia da tela ao lado do formulário ficou para o PR B** (quando a tela ganhar os scripts
  das integrações, a prévia mostra o estado real).
- **Deep link só em celular** (`isMobileUa`); desktop recebe 302 direto para o https.
- **Campanha não configurada nunca vira lista de espera** (`lotadoRedirect` só para
  `all-full`, `cap-reached`, `closed`).
- **Launch.json do checkout principal**: a entrada temporária "Girumo Config Campanha
  (worktree)" foi REMOVIDA no fim (via Node, porque o arquivo tem entradas de outras sessões
  e `git checkout --` as apagaria). Recriar se precisar do dev server da worktree:
  `--prefix C:/Users/Igor/Desktop/HubFlow-platform/.claude/worktrees/config-grupos-campanha/apps/web`, porta 3100.
- **E2E na worktree:** PowerShell carrega `E2E_EMAIL`/`E2E_PASSWORD` do `.env.local`,
  `E2E_BASE_URL=http://localhost:3100`, `npx playwright test e2e/painel-campanha-entrada.spec.ts`.

## Próximos PRs (spec, seção "Fatiamento")

- **PR B — Integrações:** aba Integrações, `meta-capi.ts` + `after()` com `event_id`
  compartilhado, GA4 e Google Ads no intersticial, CSP do `/r/` com hosts do Google, evento
  de teste, prévia da tela.
- **PR C — Configurações dos grupos:** renomear "Ações em massa", contagem por `send_state`,
  ação `check_invite` (migração da CHECK constraint nos 2 bancos + colunas de revisão).
- **PR D — Remover pessoas:** `remove_participants` (migração), listagem de participantes no
  worker, descadastrados + números colados.

## Indexar no RAG — SÓ DEPOIS DO MERGE

O CLI resolve cada linha da lista contra o checkout principal (`config.REPO_ROOT` vem da
localização do pacote, não do cwd). Antes do merge os arquivos novos não existem lá e o
`rag index` morre com `FileNotFoundError`. Ordem certa, no checkout principal:

```powershell
git pull origin main
rag index --list tools/lightrag/index-lists/config-campanha-2026-09-02.txt --full --retry-failed
rag stats
```

Enquanto o PR não mergeia, o que dá para fazer é destravar o backlog de cota (277 falhos,
166 pendentes em 02/09): `rag index --retry-failed`. A decisão em texto já foi inserida pelo
`kg_insert_text` (source `decisao-2026-09-02`) e entra nesse retry.
