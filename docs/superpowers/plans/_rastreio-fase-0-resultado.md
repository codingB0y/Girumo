# Rastreio — Fase 0, prova 5 (Melhor Envio): resultado

**Veredito: PASSA (02/11/2026).** Plano: `2026-10-30-rastreio-pedidos-fase-0-melhor-envio.md`.

- **Loja:** loja piloto (Yampi). A autorização foi feita pela conta do Melhor Envio que compra as etiquetas da loja,
  e o `quem` conferiu o dono do token antes da medição.
- **Variante da Yampi:** `sem-filtro`, com a janela `14-0` (pedidos dos últimos 14 dias). A janela padrão (45 a 15
  dias atrás) cai antes do primeiro pedido da piloto na Yampi, de 20/10. Por isso a ferramenta passou a receber a
  janela como argumento: `prova5.ps1` roda `medir sem-filtro 14-0`.
- **App:** o mesmo app Girumo da Área Dev (conta de desenvolvedor). Outra conta consegue autorizar esse app mesmo antes
  da homologação: a loja não precisa criar app nenhum.

| # | Pergunta | Resultado |
|---|---|---|
| M1 | Pedidos da Yampi criados de 2026-10-19 a 2026-11-02 (variante sem-filtro) | 25 na janela, 9 com código, 9 códigos únicos; 25 baixados, de 2026-10-20 a 2026-11-02; 0 sem data; serviço: `MEÉFÁCIL12`=5, `MESTANDARD33`=5, `MEPAC1`=3, `MESTANDARD35`=2, `MESEDEX2`=1, `MEEXPRESS31`=1, `MEPACKAGE3`=1, `MECOM4`=1, `RETIRADA NA LOJA`=4, retirada com o nome da loja=1, excursão=1; formato do código: `LLL?99999999999`=3, `LLLL999999999LL`=2, `999999999999999`=2, `LLL?LL999LL99L9LL`=1, `correios`=1; status na Yampi: `on_carriage`=9, `cancelled`=9, `waiting_payment`=3, `invoiced`=2, `paid`=1, `delivered`=1 |
| M2 | Etiquetas que o app da Girumo lista na conta da piloto | 50 em 5 página(s); a mais antiga de 2026-07-09 |
| M3 | Códigos da Yampi achados no Melhor Envio | 9 de 9 (100%): 9 pelo `tracking`, 0 pelo `self_tracking`, 0 só pela busca (0 buscados) |
| M4 | Status das etiquetas listadas | `delivered`=32, `posted`=12, `canceled`=5, `released`=1 |
| M5 | Campos de data preenchidos, por status | posted: `paid_at`=12, `generated_at`=12, `posted_at`=12, `created_at`=12, `updated_at`=12; released: `paid_at`=1, `generated_at`=1, `created_at`=1, `updated_at`=1; delivered: `paid_at`=32, `generated_at`=32, `posted_at`=32, `delivered_at`=32, `created_at`=32, `updated_at`=32; canceled: `paid_at`=5, `generated_at`=3, `canceled_at`=5, `created_at`=5, `updated_at`=5 |
| M6 | Campos preenchidos nas etiquetas `paused`, `undelivered` e `suspended` | — (nenhuma etiqueta nesses status na amostra; o Step 4 do plano não se aplicou) |
| M7 | Veredito da prova 5 | PASSA |

## Impacto

- **PR 8 (Melhor Envio).** M7 = `PASSA`. Pela regra do plano, o PR 8 entra logo depois do e-mail (PR 4) se a Y22 do
  Recuperar ficar abaixo de 80%. A Y22 ainda não foi medida, e a janela dela (45 a 15 dias) tem o mesmo problema
  da janela padrão daqui: precisa começar depois de 20/10. Já há um indício. Na Yampi, dos 10 pedidos já despachados
  (`on_carriage` ou `delivered`), só 1 aparece como `delivered`. No Melhor Envio, 32 das 45 etiquetas não canceladas
  têm `delivered_at`. Isso combina com o que a pesquisa já dizia: a Yampi não marca "entregue" sozinha.
- **§3.6 do spec: casar pela lista paginada, não pela busca.** Os 9 códigos foram achados pelo campo `tracking` da
  lista `/me/orders`. Nenhum dependeu do `self_tracking` nem da busca. A lista vem com 10 etiquetas por página, da
  mais nova para a mais antiga. O cron de 30 min pode ler as páginas até passar da etiqueta mais antiga que ainda
  importa.
- **§1.1 e §1.2: o campo de data de cada marco.** "Postado" vem de `posted_at`, "entregue" de `delivered_at` e
  "cancelado" de `canceled_at`. Todos estavam preenchidos em 100% das etiquetas de cada status. Isso dá a data real
  para a janela de 3 dias.
- **M6 em aberto.** Nenhuma etiqueta estava `paused`, `undelivered` ou `suspended`, então ainda não se sabe que
  campos esses status trazem. O PR 8 trata os três pelo `status` sozinho e mostra "problema na entrega" sem motivo,
  até aparecer um caso real.
- **A API real difere da documentação em três pontos.** O PR 8 precisa tratar os três:
  - lista vazia em `/me/orders` volta **204 sem corpo**, não 200 com `data: []`;
  - `/me/orders/search` sem resultado volta **204**, não 400;
  - `/me` (o dono do token) exige o escopo `users-read`; sem ele volta 403.
- **Conta certa.** Duas contas erradas foram autorizadas antes da certa: a conta de desenvolvedor e outra pessoal.
  As duas não tinham nenhuma etiqueta e devolviam 204 em tudo. O navegador já logado aprova o app sem perguntar a
  conta, por isso a prova passou a abrir a autorização numa janela InPrivate. No PR 8, a tela de conexão precisa
  mostrar qual conta foi conectada, com nome e e-mail vindos do `/me`, e avisar quando a conta não tem etiqueta
  nenhuma.

## Limpeza (Step 6)

- [ ] O Igor remove o acesso do app Girumo nas três contas do Melhor Envio autorizadas, a da loja e as duas pessoais.
  O PR 8 pede uma autorização nova pelo fluxo de produção.
- [ ] O Igor gera credenciais novas da Yampi, porque uma apareceu na tela durante a prova.
