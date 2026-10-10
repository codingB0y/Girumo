# Funil de anúncios — índice da série

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md`
**Mockup:** https://claude.ai/artifact/SZzoKhxrY8zvLup3znoemi
**Card do quadro:** `funil-anuncios`

## Ordem e dependências

A captura vai primeiro: o relatório só enxerga cadastros que já chegaram, então cada dia
que o pipeline está no ar antes da tela é histórico que a tela já mostra quando estrear.

| PR | O quê | Depende de | Plano |
|---|---|---|---|
| 1 | Banco: `phone_key`, `site_integrations`, `site_captures`, `ad_spend`, colunas do clique, `attribution_report` + contrato TS | — | `2026-10-10-funil-anuncios-pr1-banco.md` |
| 2 | `POST /api/integracoes/cadastro` + `POST /api/integracoes/site/chave` + stores + política de acesso | 1 | `2026-10-10-funil-anuncios-pr2-cadastro.md` |
| 4 | `/r/?cid=`: clique grava cadastro e grupo | 1, 2 | `2026-10-10-funil-anuncios-pr4-cid-no-r.md` |
| — | **Mudança no site da loja-piloto** (fora do repo, spec §5) | 2 no ar + chave gerada | — |
| 3 | Tela Configurações › Integrações › Site próprio + `GET /api/integracoes/site` (situação, últimos cadastros) | 2 | escrever depois do PR 1 |
| 5 | `GET /api/resultados/anuncios` + aba Anúncios: faixa, funil, gráfico, por onde, fora, vazio | 1 | escrever depois do PR 1 |
| 6 | Tabela com mini-funil A + gaveta do anúncio + cartões B no celular | 5 | escrever depois do PR 5 |
| 7 | Gasto: `ads:manage`, rotas, diálogo, faixa | 1, 5 | escrever depois do PR 5 |
| 8 | Card no quadro: `no_ar_verificado` só com a prova da spec §8 | todos | — |

PR 2 e PR 4 podem andar em paralelo depois do PR 1 se os arquivos não se cruzarem:
o PR 4 **modifica** `lib/stores/tracked-links.ts` e **usa** `lib/stores/site-captures.ts`,
que o PR 2 cria; por isso o PR 4 vai depois do PR 2 (mesma base).

Os planos 3, 5, 6 e 7 são escritos com o PR 1 mergeado porque consomem o JSON real de
`attribution_report` (`lerRelatorioAnuncios`) e os componentes do painel G2 que estiverem
em `main` naquela hora.

## Diferença em relação à tabela da spec §10

O `GET /api/integracoes/site` (situação e últimos cadastros) saiu do PR 2 e foi para o PR 3,
junto da tela que o usa: o PR 2 já passava de 10 arquivos com os testes. Até o PR 3, a
chave da loja-piloto é gerada pelo console do navegador (PR 2, Task 7).

## Fechamento de cada PR

Revisar → CI verde → mergear → apagar a branch, na mesma sessão (CLAUDE.md, "Regra de PR").
Mover o card `funil-anuncios` a cada PR com o motivo e o número.
