# Handoff — Configurações da campanha, PR A (Entrada) — 02/09/2026

> Estado no fim da sessão: **PR A implementado e verificado localmente, NÃO pushado, sem PR aberto.**
> Falta só a Task 10 do plano (gate local, push, PR, CI, quadro, merge).

## Prompt para retomar (cole numa sessão nova)

```
Retomar o PR A das configurações da campanha (aba Entrada). Leia primeiro, nesta ordem, e NÃO
reimplemente nada:
- docs/handoff-2026-09-02-config-campanha.md (este arquivo — estado e passos pendentes)
- docs/superpowers/plans/2026-09-02-config-campanha-entrada.md (Task 10 é o que falta)
- docs/superpowers/specs/2026-09-02-config-grupos-campanha-design.md (decisões D1–D11)
- memória: config-grupos-campanha-proposta, tecnica-verificar-artifact-com-playwright

Contexto operacional:
- Worktree: C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\config-grupos-campanha,
  branch feat/config-campanha-entrada, 11 commits à frente de origin/main, árvore limpa.
  Entrar com EnterWorktree(path). O cwd do Bash reseta: usar git -C "$W" e caminhos absolutos.
- node_modules já ligados por junction (raiz e apps/web). apps/web/.env.local já copiado.
- Verificado localmente: suíte (795/801, 6 skip), tsc web+worker, lint, E2E
  painel-campanha-entrada.spec.ts (2 rodadas), smoke do /r/grade-verao (iPhone → tela +
  cookie + whatsapp://; desktop → 302; cookie de grupo não-admin ignorado).
- Card do quadro em prod: campanhas-config-entrada (em_construcao).

Faça a Task 10 e feche o loop na mesma sessão:
1. PowerShell: Set-Location "<worktree>"; powershell -ExecutionPolicy Bypass -File infra\scripts\verify-local.ps1
2. git -C "$W" push -u origin feat/config-campanha-entrada
3. gh pr create --repo codingB0y/Girumo --base main --head feat/config-campanha-entrada
   (título e corpo estão no Task 10 do plano)
4. gh pr checks <N> --watch → gh pr merge <N> --squash --delete-branch
5. Em prod: select public.move_card('campanhas-config-entrada','no_ar_nao_verificado',
   'PR A mergeado: aba Entrada + /r/ com deep link, cookie, encerramento e lotado','PR #<N>');
6. Depois: PR B (Integrações) — plano ainda não escrito; partir da spec, seção "Fatiamento".
```

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
