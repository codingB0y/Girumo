# Rastreio — Fase 0, prova 5 (Melhor Envio): resultado

**Estado: parcial (02/11/2026).** A conta do Melhor Envio que gera as etiquetas da loja piloto ainda não foi
autorizada. As duas contas autorizadas até agora não tinham etiqueta nenhuma. Plano:
`2026-10-30-rastreio-pedidos-fase-0-melhor-envio.md`.

- Loja: loja piloto (Yampi). Variante da Yampi: `sem-filtro`, com a janela `14-0` (pedidos dos últimos 14 dias).
- A janela padrão (45 a 15 dias atrás) caiu antes do primeiro pedido da piloto na Yampi: os 25 pedidos da loja vão
  de 20/10 a 02/11. Por isso a ferramenta ganhou a janela como argumento (`medir sem-filtro 14-0`).

## Medição de 02/11 (segunda conta autorizada)

| # | Pergunta | Resultado |
|---|---|---|
| M1 | Pedidos da Yampi criados de 2026-10-19 a 2026-11-02 (variante sem-filtro) | 25 na janela, 9 com código, 9 códigos únicos; 25 baixados, de 2026-10-20 a 2026-11-02; 0 sem data; serviço: `MEÉFÁCIL12`=5, `MESTANDARD33`=5, `MEPAC1`=3, `MESTANDARD35`=2, `MESEDEX2`=1, `MEEXPRESS31`=1, `MEPACKAGE3`=1, `MECOM4`=1, `RETIRADA NA LOJA`=4, retirada com o nome da loja=1, excursão=1; formato do código: `LLL?99999999999`=3, `LLLL999999999LL`=2, `999999999999999`=2, `LLL?LL999LL99L9LL`=1, `correios`=1; status na Yampi: `on_carriage`=9, `cancelled`=9, `waiting_payment`=3, `invoiced`=2, `paid`=1, `delivered`=1 |
| M2 | Etiquetas que o app da Girumo lista na conta da piloto | 0 em 1 página(s); a mais antiga de — |
| M3 | Códigos da Yampi achados no Melhor Envio | 0 de 9 (0%): 0 pelo `tracking`, 0 pelo `self_tracking`, 0 só pela busca (9 buscados) |
| M4 | Status das etiquetas listadas | — |
| M5 | Campos de data preenchidos, por status | — |
| M6 | Campos preenchidos nas etiquetas `paused`, `undelivered` e `suspended` | — |
| M7 | Veredito da prova 5 | `NAO_PASSA` **contra a conta errada**: não vale como veredito |

## O que já se sabe

- **A piloto cota o frete pelo Melhor Envio.** Os 19 pedidos com entrega trazem em `shipment_service` o prefixo
  `ME`, o nome do serviço e o número dele no catálogo do Melhor Envio (1 PAC, 2 SEDEX, 3 .Package, 4 .Com, 12 éFácil,
  31 Express, 33 e 35 Standard). Os outros 6 são retirada ou excursão.
- **Os códigos vêm de várias transportadoras.** Só 1 dos 9 tem o formato dos Correios; os outros têm 4 desenhos
  diferentes. Bate com etiquetas compradas por um agregador.
- **As etiquetas estão em outra conta do Melhor Envio.** As duas contas autorizadas respondem 204 em
  `/me/orders` sem filtro e com cada um dos 6 status, a busca não acha nenhum dos 9 códigos, e o painel do Melhor
  Envio, logado na segunda conta, também não mostra etiqueta nenhuma. Falta a conta conectada à Yampi da piloto.
- **A API real difere da documentação em dois pontos**, e o PR 8 precisa tratar os dois:
  - lista vazia em `/me/orders` volta **204 sem corpo**, não 200 com `data: []`;
  - `/me/orders/search` sem resultado também volta **204**, não 400.
- **`/me` (quem é o dono do token) pede o escopo `users-read`.** Sem ele volta 403. A autorização da prova passou a
  pedir esse escopo, e o comando `quem` mostra nome e e-mail mascarados para confirmar a conta antes de medir.

## Falta

1. Descobrir a conta do Melhor Envio conectada à Yampi da piloto (painel da Yampi ou a dona da loja).
2. Autorizar com ela (`credenciais-me.ps1`), conferir com `quem` e rodar `medir sem-filtro 14-0`.
3. Preencher a tabela final, M6 (Step 4 do plano) e a seção "Impacto" do plano.
4. O Igor remove o acesso do app Girumo nas contas do Melhor Envio autorizadas e gera credenciais novas da Yampi:
   uma credencial da Yampi apareceu na tela durante a prova.
