# Funil de anúncios — índice da série

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md`
**Mockup:** https://claude.ai/artifact/SZzoKhxrY8zvLup3znoemi
**Card do quadro:** `funil-anuncios`

## Ordem e dependências

A captura vai primeiro: o relatório só enxerga cadastros que já chegaram, então cada dia
que o pipeline está no ar antes da tela é histórico que a tela já mostra quando estrear.

| PR | O quê | Depende de | Plano |
|---|---|---|---|
| 1 | Banco: `phone_key`, `site_integrations`, `site_captures`, `ad_spend`, colunas do clique, `attribution_report` + contrato TS | #423 (Postar por grupo PR 1) mergeado e em prod | `2026-10-10-funil-anuncios-pr1-banco.md` |
| 2 | `POST /api/integracoes/cadastro` + `POST /api/integracoes/site/chave` + stores + política de acesso | 1 | `2026-10-10-funil-anuncios-pr2-cadastro.md` |
| 4 | `/r/?cid=`: clique grava cadastro e grupo | 1, 2 | `2026-10-10-funil-anuncios-pr4-cid-no-r.md` |
| — | **Mudança no site da loja-piloto** (fora do repo, spec §5) | 2 no ar + chave gerada | — |
| 3a | `GET /api/integracoes/site` (situação, últimos 5 com telefone mascarado), ensaio `POST /api/integracoes/site/teste`, `telefoneMascarado`/`chaveDoTelefone` em `lib/pages/phone.ts`, paridade com `public.phone_key` (integração) | 2 | `2026-10-10-funil-anuncios-pr3-integracao-tela.md` |
| 3b | Tela Configurações › Integrações › Site próprio + 403 da vendedora no E2E | 3a, 5a | idem |
| 5a | `GET /api/resultados/anuncios` + `ads:manage` + `semGasto`/`RelatorioParaTela` (operador não vê gasto) | 1 | `2026-10-10-funil-anuncios-pr5-aba-anuncios.md` |
| 5b | Aba Anúncios: faixa, funil, gráfico, por onde, fora, vazio, erro, regras, celular + E2E de cadeia | 5a | idem |
| 6a | Função `attribution_people` (**DDL do Igor**) + rota da gaveta + filtro do Contatos | 3a, 5b | `2026-10-10-funil-anuncios-pr6-tabela-gaveta.md` |
| 6c | Contatos filtrado pela URL ("Ver os N em Contatos", "Entraram e ainda não compraram") | 6a | idem |
| 6b | Tabela com mini-funil A + gaveta + cartões B no celular | 6a, 6c | idem |
| 7 | Gasto: rotas `/api/anuncios/gasto`, store, diálogo, ligação na faixa e no gráfico (usa o `ads:manage` do 5a) | 5b | `2026-10-10-funil-anuncios-pr7-gasto.md` |
| 8 | Card no quadro: `no_ar_verificado` só com a prova da spec §8 | todos | — |

PR 2 e PR 4 podem andar em paralelo depois do PR 1 se os arquivos não se cruzarem:
o PR 4 **modifica** `lib/stores/tracked-links.ts` e **usa** `lib/stores/site-captures.ts`,
que o PR 2 cria; por isso o PR 4 vai depois do PR 2 (mesma base).

Os planos 3, 5, 6 e 7 foram escritos em 11/10 com os PRs 1, 2 e 4 em `main`, contra o JSON real de
`attribution_report` (`lerRelatorioAnuncios`) e os componentes do painel G2 de `main`. Cada um passou
de ~10 arquivos e foi dividido em dois ou três PRs (exceto o 7). Ordem sugerida: 3a e 5a (independentes) →
5b → 3b → 6a → 6c → 6b → 7. A única DDL nova é a do 6a (`attribution_people`), aplicada pelo Igor.

## Diferença em relação à tabela da spec §10

O `GET /api/integracoes/site` (situação e últimos cadastros) saiu do PR 2 e foi para o PR 3,
junto da tela que o usa: o PR 2 já passava de 10 arquivos com os testes. Até o PR 3, a
chave da loja-piloto é gerada pelo console do navegador (PR 2, Task 7).

## Fechamento de cada PR

Revisar → CI verde → mergear → apagar a branch, na mesma sessão (CLAUDE.md, "Regra de PR").
Mover o card `funil-anuncios` a cada PR com o motivo e o número.
