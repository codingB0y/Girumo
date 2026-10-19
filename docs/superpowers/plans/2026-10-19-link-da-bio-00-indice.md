# Link da bio — índice da série

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` (§9 = contratos, §12 = PRs, §13 = prova)
**Mockup:** https://claude.ai/artifact/AU7UMh4kNjtRqRYnyrjE5z (canvas privado: os 4 modelos e o editor no celular e no computador)
**Fonte do mockup e checagens (fora do repo, tem dado da loja-piloto):** `Desktop/girumo-design-refs/link-da-bio/`
**Prompt para começar num chat novo:** `docs/superpowers/plans/2026-10-19-link-da-bio-prompts-sessao.md`
**Card do quadro:** `link-da-bio`

## Ordem e dependências

| PR | O quê | Depende de | Plano |
|---|---|---|---|
| 1 | Banco: `bio_pages`, `bio_slugs` (+ trigger), `bio_contagens`, `bio_contar`, `bio_relatorio`, check SQL, baseline | — | `2026-10-19-link-da-bio-pr1-banco.md` |
| 2 · Parte 1 | Núcleo puro: `documento.ts`, `cores.ts`, `escapeHtml` com `'` | — (não toca o banco) | `2026-10-19-link-da-bio-pr2-nucleo.md` |
| 2 · Parte 2 | Store `bio-pages.ts`, `conferir.ts`, `cache.ts` | 1, 2·1 | idem |
| 3a | Renderizador base + modelo Etiqueta + Lexend + `script.ts` | 2·1 | `2026-10-19-link-da-bio-pr3a-render-etiqueta.md` |
| 4a · Parte 1 | `/bio/<slug>` no www, 301 do slug antigo, registros, visita, 308 de `app.`/apex, e2e | 2·2, 3a | `2026-10-19-link-da-bio-pr4a-rota-publica.md` |
| 4a · Parte 2 | Raiz do domínio próprio (`"bio-root"`) + `invalidarBioDaLoja` nas rotas de campanha, e2e | 4a·1 | idem |
| 4b | Toque: `POST /api/p/bio/toque` + beacon no `script.ts` | 4a·2 | `2026-10-19-link-da-bio-pr4b-toque.md` |
| 5 | API do painel: `/api/link-da-bio`, `/slug`, `/relatorio` | 2·2 | `2026-10-19-link-da-bio-pr5-api-painel.md` |
| 6a · Parte 1 | Painel: editor, aba Links, folha de link, salvar/descartar, criar (ainda sem item no menu) | 3a, 4a·2, 5 | `2026-10-19-link-da-bio-pr6a-painel-links.md` |
| 6a · Parte 2 | Prévia (coluna fixa / tela cheia) e guarda de saída | 6a·1 | idem |
| 3b | Modelos Vitrine, Romaneio e Clássico + fontes | 3a | `2026-10-19-link-da-bio-pr3b-render-modelos.md` |
| 6b · Parte 1 | Aba Perfil (uploads, foco da foto, confere) + fotos na folha de link | 6a·2 | `2026-10-19-link-da-bio-pr6b-painel-aparencia.md` |
| 6b · Parte 2 | Abas Aparência e Divulgar (QR, números) + item no menu | 6b·1, 3b | idem |
| 7 | Rastreamento: Pixel/GA4 na página + bloco "Avançado" no Perfil | 4b, 6b | `2026-10-19-link-da-bio-pr7-rastreio.md` |
| — | Card `no_ar_verificado` só com a prova do §13 | todos | — |

Ordem sugerida com um implementador: 1 e 2·1 (em paralelo: arquivos disjuntos) → 2·2 → 3a → 4a·1 → 4a·2 → 4b → 5 →
6a·1 → 6a·2 → 3b → 6b·1 → 6b·2 → 7.
Com dois: um segue 2·1 → 3a → 4a·1 → 4a·2 → 4b → 3b; o outro faz 1 → 2·2 → 5 e pega o 6a quando o 3a e as duas
partes do 4a estiverem em `main`.

Por que essa ordem: a página pública com o modelo padrão vai ao ar antes do painel (sem página criada, a rota só
responde 404, nada quebra); o painel nunca mostra um endereço que ainda não abre; e o item no menu só aparece no
6b·2, com Aparência e Perfil prontos, para o lojista não cair numa página pela metade.

## O que vale em todos os planos

- Antes de cada PR/parte: `git fetch origin main`, worktree novo a partir de `origin/main` e conferir que o que ele
  depende já está em `main` (cada plano traz o comando).
- Os nomes do §9 são contrato: um plano que precisar de nome novo acrescenta, nunca renomeia. A seção "Interface com
  os outros PRs" de cada plano é o contrato com os vizinhos (conferida na revisão cruzada de 19/10).
- Foto e CNPJ da loja-piloto nunca vão pro repo (é público): testes e exemplos usam dados fictícios.
- Revisão de segurança antes de mergear o 4a, o 4b, o 5 e o 7 (spec §10).
- Banco: a migração é aplicada pelo CI (`migrate-dev` no PR, `migrate-prod` no merge). Nunca DDL à mão.

## Ambiente do worktree

Vale sobre qualquer linha dos planos que diga outra coisa.

- `node_modules` por **duas junctions** (o `next` mora em `apps/web/node_modules`), custo zero de disco:

  ```powershell
  cmd /c mklink /J "<worktree>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
  cmd /c mklink /J "<worktree>\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules"
  ```

  Antes, conferir que o `node_modules` do checkout principal não está vazio; se estiver, `npm ci` no worktree. O disco
  C: vive quase cheio (cada `npm ci` custa 1–2 GB). Ao apagar o worktree, desarmar as junctions primeiro
  (`[System.IO.Directory]::Delete(<junction>, $false)`), senão o delete leva o `node_modules` real junto.
- Não há `.env.local` com credencial de dev nesta máquina (o da raiz só tem `VERCEL_OIDC_TOKEN`). O e2e contra o
  dev usa `E2E_SUPABASE_URL`/`E2E_SUPABASE_SERVICE_ROLE_KEY`: no CI elas existem; localmente o e2e só roda se
  estiverem no ambiente. Consultas de conferência no banco de dev vão pelo MCP do Supabase (`execute_sql`).
- Gate antes de cada push: `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1` (os dois `tsc`
  e o build). O `tsconfig` mira ES2017: regex com a flag `s` (dotAll) não compila (TS1501) — use `[\s\S]`.
- A pasta `docs/superpowers/plans/.impeccable/` é cache de hook: nunca commitar.

## Fechamento de cada PR

Revisar → CI verde → mergear → apagar a branch, na mesma sessão (CLAUDE.md, "Regra de PR"). No card
`link-da-bio` (prod): reescrever o `blocker` a cada PR e chamar `select public.move_card(...)` quando o status
mudar (o `move_card` para o mesmo status não grava evento e não limpa o `blocker`).
