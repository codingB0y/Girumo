# Recuperar — carrinho e Pix da Yampi pelo WhatsApp — design

**Data:** 29/10/2026 · **Status:** rascunho revisado (construtor + sessão do Rastreio), esperando aprovação do Igor
**Mockup:** https://claude.ai/artifact/4STrnMzSBg58JodRxW3j8Z (Como funciona · o que a cliente recebe no Pix
e no carrinho · Hoje · Conversas · Automático · Scripts e depoimentos · Ajustes · Ativar)
**Pesquisa de mercado e custo** (repo privado, cita concorrente): `girumo-notas/docs/strategy/2026-10-29-recuperar-yampi-analise.md`

## Problema

A loja que vende pela Yampi perde venda em dois pontos que hoje ninguém trata dentro da Girumo:

- **Pix pendente** — o pedido foi criado com Pix e não foi pago. Na Yampi o Pix vence em 30 min se o lojista
  não mexer na configuração.
- **Carrinho abandonado** — a cliente montou o pedido no site e não finalizou.

A Yampi recupera por e-mail. WhatsApp automático ela não faz; o lojista chama na mão, quando chama.

O **Recuperar** é um add-on de **R$ 127/mês**. A Yampi avisa a Girumo; um número de WhatsApp só da
recuperação manda a mensagem no ritmo certo; quem responde cai num chat dentro da Girumo, com o pedido do lado
e scripts prontos. Quem não quer automático usa só a fila do dia e o chat.

## Decisões do Igor (29/10)

| Pergunta | Decisão |
|---|---|
| Produto | Add-on pago à parte, **R$ 127/mês**, administrado dentro da Girumo |
| Canal | **API não oficial (Evolution)**, num **número separado** do número dos grupos. Escolhido com a opção oficial (a do Rastreio do pedido, via Zernio) na mesa |
| O que faz | Recuperação **automática** (Pix com o copia e cola; carrinho com cadência curta e depoimento de cliente) **e** chat embutido com scripts prontos pra quem prefere mandar na mão |
| Cadência | Curta, por causa do risco de banimento |
| Regra "nunca DM" de 28/07 | Exceção só aqui: só pelo número da recuperação, só pra quem passou pelo checkout da Yampi da loja |

## Escolhas minhas (dá pra mudar)

| Escolha | Por quê |
|---|---|
| Ordem de entrega: **Pix → Conversas → Carrinho** | Pix tem mais intenção (ela já fez o pedido), base legal mais forte, menos mensagens |
| Credencial colada na v1 (alias + token + chave) e pedido de "Parceiro Tech" da Yampi em paralelo | OAuth da Yampi só existe pra app homologado (revisão de até 14 dias úteis por envio) |
| Carrinho **no dia seguinte às 10h**, não em 30–60 min | Experimento de campo (Li, Luo, Lu e Moriguchi, *Journal of Marketing*, 2021; ~64 mil clientes): lembrete 30–60 min depois vendeu **menos** que não mandar nada; 1–3 dias depois vendeu mais, e mais ainda em carrinho com muitas peças (o caso do atacado) |
| **Grupo de controle de 10%** | Mostra a venda a mais, e não só quem ia pagar de qualquer jeito |
| Automático começa **desligado** | O lojista revisa os scripts e testa no próprio WhatsApp antes de ligar |
| Conversas novas por dia: **20, subindo até 60** | Número novo mandando no privado pra quem não escreveu primeiro |
| **Sem "digitando" e sem girar texto** | `hubflow-engine/DECISIONS.md` (vinculante pra tudo que envia) recusa `humanEntropy` e `contentVariator` como evasão |
| Até 3 versões por mensagem = **teste A/B de conversão** | Medir qual texto vende mais; nunca usado como escudo contra filtro |
| 1ª mensagem do carrinho termina com "responda SAIR" | Oposição fácil (LGPD, legítimo interesse) e quem não quer responde SAIR em vez de denunciar |
| Sem cupom por padrão | Cupom cedo ensina a abandonar |
| Sem vídeo de depoimento | Egress do Supabase (incidente de 17/10) |
| SAIR vai pra uma lista própria, "não falar no privado" (Recuperar e Rastreio). A `optouts` geral continua bloqueando, mas não ganha linha nova | SAIR de um lembrete não deve tirar a cliente da captura de contatos nem do sinal de venda pro Meta, que leem a `optouts` |
| A Fase 0 decide se o automático liga | Sem ligar a resposta ao telefone de forma determinística, o caso não para quando ela responde e o SAIR não é garantido |
| "Testar no meu WhatsApp" só pra números da equipe cadastrados em Ajustes | Não abrir exceção à regra de só falar com quem passou pelo checkout |

## Metas, fora de escopo e o que não pode acontecer

**Metas da v1**

1. Pix pendente recuperado no automático, com o código pronto pra copiar.
2. Carrinho recuperado no automático, com pergunta, depoimento e link.
3. Chat dentro da Girumo pra quem respondeu, com o pedido do lado e scripts prontos.
4. Modo manual: sem automático, a fila do dia + o chat.
5. Medir a venda a mais contra o grupo de controle.

**Fora da v1**

Boleto e cartão recusado. Outra plataforma além da Yampi. E-mail e SMS. API oficial. Áudio enviado pelo
painel. Vídeo de depoimento. Atribuir conversa a uma pessoa, etiquetas, funil (não é CRM).

**Não pode acontecer** (mesmo que "funcione")

- O número dos grupos mandar mensagem no privado, ou o número da recuperação postar em grupo.
- Mandar pra lista de contatos ou pra quem não passou pelo checkout: só evento da Yampi abre caso.
- "Digitando" falso, troca de aparelho, proxy, texto girado (`DECISIONS.md`).
- Depoimento sem autorização da cliente, prazo inventado, "última chance" que não é a última.
- Mandar o link de carrinho que já entra logado na conta da cliente (`simulate_url`, abaixo).
- IA na tela do lojista.

**Como saber que deu certo** (piloto de 30 dias)

- A taxa de quem recebeu mensagem é maior que a do grupo de controle, no Pix e no carrinho.
- Nenhuma restrição do número da recuperação, e zero efeito no número dos grupos.

## Restrições externas (pesquisa de 29/10)

**Yampi** (`docs.yampi.com.br`, help center e integrações da comunidade)

- Autenticação: headers `User-Token` + `User-Secret-Key`, base `https://api.dooki.com.br/v2/{alias}`. O lojista
  copia em Perfil › Credenciais de API. **O token muda quando o lojista troca a senha** → a Girumo passa a
  levar 401.
- Aviso (webhook): criado por `POST /{alias}/webhooks {name, url, events[]}`, que devolve `secret_key`.
  Assinatura `X-Yampi-Hmac-SHA256` = base64 do HMAC-SHA256 do **corpo cru** com o `secret_key`. Responder 2xx
  em até 5 s; 30 falhas desativam o aviso. Reenvio e ordem não são documentados, e a comunidade relata aviso
  perdido sem erro → idempotência + reconciliação.
- Eventos usados: `cart.reminder`, `order.created`, `order.paid`, `order.status.updated`,
  `transaction.payment.refused`. Envelope `{event, time, merchant{id, alias}, resource}`; `time` sem fuso
  (horário de Brasília, segundo a comunidade).
- Carrinho: `cart.reminder` sai ~3 min depois da última atividade — é candidato, reconferir antes de mandar.
  Traz `id`, `token`, `customer.data{name, phone{area_code, number}}`, `items.data[]` (quantidade, preço,
  `sku.data.title`), `totalizers.total`. Links: `simulate_url` **entra logado na conta da cliente** (leva
  `customerToken`): nunca mandar. `unauth_simulate_url` força logout. Foto da peça só pela API de SKU.
- Pix: `order.created` com `status.data.alias = waiting_payment` e pagamento `pix`. Código e validade em
  `transactions.data[0].metadata[]` (`pix_qr_code`, `pix_expiration_date`) segundo integrações da comunidade;
  o schema oficial não lista. Não existe evento "Pix venceu". Validade padrão de 30 min; o lojista sobe até
  1 dia em alguns gateways (Checkout › Formas de pagamento › Pix).
- O pedido traz `cart_token` (= `token` do carrinho): é assim que se sabe que o carrinho virou pedido.
- Limite: ~60 req/min por rota e por IP de origem.

**WhatsApp / Evolution**

- Evolution v2.3.7. Nos grupos, o número de produção está 100% em `@lid`; em conversa 1:1 não sabemos se a
  resposta chega em `@lid` nem se o telefone vem junto → prova 0.
- Brasil: o JID de alguns celulares não tem o 9º dígito. O `whatsappNumbers` da Evolution devolve o JID certo.
- Os termos do WhatsApp proíbem automação por cliente não oficial. Risco aceito pelo Igor. Nenhum controle
  garante não-ban (`DECISIONS.md`, "Ressalva permanente").

**LGPD**

- Pix pendente de pedido feito: execução de contrato (art. 7º, V).
- Carrinho: legítimo interesse (art. 7º, IX e art. 10) — exige teste de balanceamento escrito, transparência e
  canal de oposição (o SAIR).

## Abordagem

```
Yampi ──aviso──► /api/integracoes/yampi/webhook ──► yampi_events ──► processador ──► recovery_cases
                                                                                         │
                               cron /api/cron/recuperar (5 min): agendador + reconciliação
                                                                                         ▼
cliente ◄── Evolution ◄── worker (claim com a política de DM) ◄── engine_commands (tipo de DM)
   │
   └─resposta──► /api/webhooks/evolution ──► recovery_messages ──► para o caso ──► Conversas
```

| Descartada | Por que não |
|---|---|
| API oficial via Zernio, no número do Rastreio | Escolha do Igor (não oficial: sem custo por mensagem, texto livre) |
| Usar o número dos grupos | Uma restrição derrubaria os grupos junto |
| Criar o comando de envio com dias de antecedência | Comando parado mais de 15 min é cancelado (`missed_send_tolerance`), e teto e horário mudam até lá. O agendador só enfileira o que já venceu |
| Supabase Realtime no chat | É decorativo no app (só o sino assina); polling |
| Deixar o histórico só na Evolution | A VPS única caiu em 28/10; o chat tem que abrir com ela fora |

**A conexão com a Yampi é da loja, não do Recuperar.** O Rastreio do pedido (outra série, também de 29/10) vai
consumir a mesma conexão e o mesmo aviso. Quem for construído primeiro faz essa base; o outro só acrescenta
eventos e o seu consumidor.

**O envio no privado também é da loja.** O Rastreio também vai mandar pela Evolution (decidido em 29/10). O
número que fala no privado é uma instância com `purpose = 'privado'` e a lista de módulos que ele atende
(`recuperar`, `rastreio`). Com um chip só ou com dois, o código é o mesmo (seção 12, pergunta 1). Na tela do
Recuperar ele aparece como "número da recuperação". A "Base do privado" (seção 3) é comum aos dois módulos.

## 1. Regras

### 1.1 Quem entra num caso

- Só cliente que passou pelo checkout da Yampi da loja, com celular. Telefone = `55` + `area_code` + `number`,
  só dígitos (o `full_number` às vezes vem sem o 55).
- Fica de fora:
  - telefone na lista "não falar no privado" (o SAIR, deste módulo ou do Rastreio) ou na `optouts` geral da
    loja, comparando por `phone_key()` (tolera o 55 e o 9º dígito). O `isOptedOut` de hoje compara dígitos
    exatos e não serve aqui;
  - números que a loja marcou pra ignorar (equipe, teste);
  - cliente que recebeu sequência nos últimos 7 dias;
  - pedido ou carrinho de valor zero.
- 1 caso por (loja, tipo, id na Yampi). Novo carrinho do mesmo telefone em 7 dias atualiza o caso aberto (peças
  e valor) sem recomeçar a sequência.

### 1.2 Sequência do Pix

Abre com `order.created` (ou a reconciliação) em `waiting_payment` com pagamento Pix.

| Passo | Quando | O que vai |
|---|---|---|
| P1 | 3 min depois do pedido (3, 5 ou 10) | Texto "seu pedido tá separado" e, logo em seguida, **uma mensagem só com o código Pix** (copiar com um toque). Sem código no pedido → link do pedido no lugar |
| P2 | 10 min antes de vencer (10, 30 ou não lembrar), **só se a validade for de 60 min ou mais** | Lembrete com a hora em que vence |
| P-venceu | No dia seguinte às 10h, se venceu sem pagar, o pedido segue aguardando e tem menos de 48 h | "Venceu, mas as peças continuam separadas; quer ajuda pra finalizar?" Sem código |
| Obrigado | No `order.paid`, **só se algum passo saiu antes do pagamento** | Confirmação + "salva esse número" |

- No máximo 3 passos por caso (P1, P2 ou P-venceu, Obrigado). O código do P1 é parte do P1.
- P1 que cairia fora do horário sai na abertura do horário seguinte, se o Pix ainda vale; senão o caso vai pro
  P-venceu.
- Pix de 30 min recebe só o P1 (P2 sairia 17 min depois do P1, insistente demais pra um número desconhecido).
  A tela Ajustes mostra a validade medida nos pedidos da loja e sugere subir pra 3 h.

### 1.3 Sequência do carrinho

Abre com `cart.reminder` com celular.

| Passo | Quando | O que vai |
|---|---|---|
| C1 | No dia seguinte às 10h (opções: 3 h depois, dia seguinte 10h, 2 dias depois 10h) | Pergunta sobre o que travou, **sem link** (o editor bloqueia link aqui), terminando com "Se não quiser receber, é só responder SAIR." |
| Resposta à C1 (liga/desliga, ligado) | Na hora, se a resposta não for recusa nem SAIR (1.6) | 1 mensagem: o link do carrinho + "a {vendedora} já te responde por aqui" |
| C2 | 1 dia depois da C1 (1 dia, 2 dias ou não mandar) | Depoimento (foto + legenda) + link do carrinho |
| C3 | Desligado por padrão; 2 dias depois da C2 | Último lembrete (é mesmo o último), cupom opcional |

- Antes de cada passo, reconferir que o carrinho não virou pedido: um `order.created` com o `cart_token`, ou
  a API da Yampi (`total_transactions` / `last_transaction_status`).
- Link do carrinho: o que abre o carrinho **sem logar** (prova 0 decide entre `unauth_simulate_url` e a URL de
  recuperação). Nunca `simulate_url`.
- Carrinho com mais de 72 h sem nenhum passo enviado vira `perdido` e não recebe nada.

### 1.4 Quando para

| Acontecimento | O que muda |
|---|---|
| `order.paid` do pedido do caso | Pix: recuperado se algum passo saiu; manda o Obrigado (1.2) |
| Carrinho virou pedido (`order.created` com o `cart_token`) | Caso do carrinho fecha como "virou pedido"; se o pedido é Pix pendente, abre o caso do Pix |
| Pedido do carrinho pago em até 7 dias da C1 | Carrinho recuperado |
| Cancelado ou recusado (`order.status.updated`) | Para |
| Ela respondeu | Para o automático do caso; a conversa vai pra "Precisa de você" |
| SAIR | Entra na lista "não falar no privado", para todo caso da loja pra esse telefone (Recuperar e Rastreio), 1 mensagem de confirmação, conta como sinal (1.6) |
| Telefone sem WhatsApp | `sem_whatsapp`; aparece na fila com "Ver dados" |
| Pagou por outro pedido | Para; não conta como recuperado se nada saiu antes |
| Pausa de proteção do número | Nada sai até retomar |
| Add-on desligado | Para tudo; os casos ficam pra consulta |

### 1.5 Ritmo do número (política de mensagem no privado)

- **Conversa nova** = 1ª mensagem de um caso pra um telefone que nunca escreveu pro número da recuperação.
- **Teto de conversas novas por dia:** 20 nos 3 primeiros dias do número; +10 a cada 3 dias seguidos sem pausa
  de proteção; no máximo 60. Depois de uma pausa, volta pra 20.
- **Mensagens pra quem ainda não respondeu:** até 3× o teto de conversas novas no dia, somando automático e
  manual. Mensagem pra quem escreveu nas últimas 24 h não conta.
- **Intervalo entre envios do número:** sorteado entre 40 e 120 s, como o jitter que já existe na fila. Dentro de
  um passo (texto + código, foto + legenda): 5–15 s.
- **Horário:** 9h às 21h, horário de Brasília; ajustável entre 8h e 22h.
- **No teto, a ordem é:** Pix antes (vence logo), depois carrinho de maior valor. O que não sai hoje fica pro
  próximo horário se ainda vale; senão vira `perdido`.
- **Proibido** (vinculante): "digitando", marcar como lida pra parecer gente, girar texto pra driblar filtro.
- Teto, intervalo e pausa são por instância de privado. Com um chip só pros dois módulos, o teto do dia é
  dividido com prioridade Pix > aviso de pedido > carrinho.

### 1.6 Pausa de proteção

- **Sinais**, por número, numa janela de 24 h:
  - resposta SAIR;
  - resposta de recusa: "não pedi", "quem é", "não conheço", "spam", "denunciar", "para de mandar", "engano".
    É uma lista em código, com teste.
- **3 sinais em 24 h** pausam o automático daquele número por 24 h e avisam no sino.
- **Pausa imediata:**
  - erro de restrição no envio (ex.: 463, `rate-overlimit`);
  - taxa de entrega abaixo de 60%, contada nas últimas 20 mensagens com mais de 1 h (o `DeliveryTracker` do
    `DECISIONS.md`). Depende da prova 0 mostrar a confirmação de entrega.
- Durante a pausa, não sai conversa nova. Responder quem escreveu nas últimas 24 h continua liberado. Ao sair
  da pausa, o teto volta pra 20.

### 1.7 Modo manual (automático desligado)

- Cada caso entra na fila de Hoje na hora em que o automático mandaria, com o botão **Mandar**.
- O botão abre a conversa com o script do passo já preenchido; quem envia é a pessoa.
- Vale o mesmo ritmo do número: a mensagem entra na fila e a tela mostra quando sai.

### 1.8 O que conta como recuperado, e o grupo de controle

- **Recuperado** = pagou depois de pelo menos um passo enviado:
  - Pix: `order.paid` do mesmo pedido;
  - carrinho: pedido com o `cart_token`, pago em até 7 dias da C1.
- "Marcar como recuperado" (com valor) cobre venda fechada por fora, por exemplo pelo chat.
- **Grupo de controle:** 10% dos casos elegíveis não recebem nada. O sorteio é determinístico pelo id do caso e
  liga/desliga em Automático. A mesma regra de "pagou" vale pra eles, e a tela mostra a taxa com mensagem ao
  lado da taxa sem mensagem.

### 1.9 Scripts

- **Padrões criados na ativação**, a partir do mockup:
  - Pix: P1, código, P2, venceu, obrigado;
  - carrinho: C1, resposta, C2, C3;
  - chat: link do carrinho, frete e prazo, pedido mínimo, grade, troca, Pix venceu, código de novo.
- **Campos:** `{nome}`, `{vendedora}`, `{loja}`, `{pedido}`, `{pecas}`, `{valor}`, `{vence_as}`, `{peca}`
  (1ª peça), `{mais_pecas}`, `{link}`, `{pedido_minimo}`, `{prazo_troca}`.
- `{nome}` = primeiro nome, até 20 letras, sem link, sem `@`, sem número. Um nome com link faria o número
  mandar link.
- Campo obrigatório vazio → aquele passo vai pra mão ("Precisa de você"), nunca sai texto quebrado.
- **A/B:** até 3 versões por passo automático, sorteio uniforme, contadores por versão (enviadas, responderam,
  pagaram) e "fixar esta". Nada gerado por máquina.
- **Conferência ao salvar:** só avisa (nome, quem fala e de qual loja, uma pergunta ou um pedido só, sem caixa
  alta, sem "última chance"). Bloqueia em dois casos: link na C1, e C1 sem a linha do SAIR.

### 1.10 Depoimentos

- Foto (jpg, png, webp, até 5 MB), reduzida no servidor pra até 300 KB (o `sharp` já é dependência do web) e
  guardada em bucket privado.
- Legenda de até 300 caracteres.
- "A cliente autorizou" é obrigatório e grava quem marcou e quando.
- Até 10 ativos. A C2 sorteia entre eles, e cada um tem contadores (enviados, compraram).

## 2. Dados

Nomes sugeridos. Toda tabela tem `tenant_id`, RLS ligado e policy no padrão `auth.uid()` + `memberships`
(helper que já exclui a vendedora). As stores usam service-role com `.eq('tenant_id', …)`. Migração pelo CI
(`apply-order.txt` + baseline), idempotente.

| Tabela | Uma linha por | Campos principais |
|---|---|---|
| `yampi_connections` | loja (única) — **compartilhada com o Rastreio** | `alias`, `user_token` e `user_secret_key` selados, `webhook_id`, `webhook_secret` selado, `events`, `status` (`ativa` · `credencial_invalida` · `aviso_desativado` · `desconectada`), `last_event_at`, `last_check_at`, `last_error` |
| `yampi_events` | aviso recebido | `connection_id`, `event`, `resource_id`, `dedupe_key` única, `payload` (tem dado pessoal: guardar 30 dias), `received_at`, `processed_at`, `error` |
| `recovery_settings` | loja | `automatico` (false), `pix_ligado`, `carrinho_ligado`, esperas e opções de 1.2/1.3, `responder_com_link`, `cupom`, `horario_inicio`/`fim`, `controle` (true), `assinatura` (quem assina), `nome_loja`, `pedido_minimo_cents`, `prazo_troca`, `numeros_ignorados` |
| `recovery_cases` | (loja, tipo, id na Yampi) | `kind` (`pix` · `carrinho`), `yampi_id`, `cart_token`, `order_number`, `customer_name`, `phone`, `jid`, `total_cents`, `items` (até 30), `link`, `pix_code` (nunca em log), `pix_expires_at`, `status` (ver abaixo), `stop_reason`, `control`, `step`, `next_step_at`, `conversation_id`, `recovered_at`, `recovered_cents`, `recovered_manual` |
| `recovery_conversations` | (loja, telefone) | `instance_id`, `phone`, `jid`, `lid` (pode ser nulo; único por loja), `contact_name`, `status` (`precisa_de_voce` · `aberta` · `encerrada`), `unread`, `last_message_at`, `last_preview` (até 200), `first_outbound_at`, `last_inbound_at`, `current_case_id` |
| `recovery_messages` | mensagem | `conversation_id`, `case_id`, `direction`, `author` (`automatico` · `pessoa` · `cliente` · `celular`), `author_user_id`, `kind` (`texto` · `imagem` · `audio` · `outro`), `text` (até 4096), `media_ref`, `step_key`, `script_id`, `variant`, `provider_message_id`, `status` (`na_fila` · `enviada` · `entregue` · `lida` · `falhou` · `cancelada`), `error` |
| `recovery_scripts` | script | `key` (ex.: `pix.p1`, `carrinho.c1`, `chat.frete`), `kind`, `use` (`automatico` · `chat`), `title`, `variants` (1 a 3), `fixed_variant`, `active` |
| `recovery_testimonials` | depoimento | `storage_path`, `caption`, `label`, `authorized_by`, `authorized_at`, `active`, `sends`, `conversions` |
| `private_number_state` | instância de privado (comum com o Rastreio) | `instance_id`, `ramp_started_at`, `healthy_since`, `paused_until`, `pause_reason`, `next_send_at` |
| `private_signals` | sinal de proteção (comum) | `instance_id`, `kind`, `at`, `message_ref` |
| `private_optouts` | telefone que pediu SAIR (comum) | `phone`, `phone_key`, `module`, `at`, `message_ref` |

Status do caso: `agendado` · `em_sequencia` · `respondeu` · `recuperado` · `virou_pedido` · `parado` ·
`perdido` · `sem_whatsapp` · `nao_quer` · `controle`.

Mudanças em tabelas que já existem:

- `instances.purpose` — `grupos` (padrão) ou `privado`; `instances.private_modules` — quais módulos o número
  de privado atende (`recuperar`, `rastreio`), vazio quando é `grupos`.
- `engine_commands` — no comando de DM: o módulo de origem, `valid_until`, o id da mensagem na Evolution e o
  status (enviada · entregue · lida · falhou). Coluna nova ou tabela ao lado, a critério de quem constrói; o
  módulo lê pelo id do comando.
- `tenant_settings.recuperar_enabled` — como `instagram_enabled`.
- `memberships.modules` — o CHECK aceita `recuperar` além de `postar`
  (`20261007120100_acesso_vendedora.sql:99`).
- `optouts` — passa a ser lida (por `phone_key()`) na barreira do envio de DM. Não ganha linhas do SAIR.

**Retenção:** avisos crus 30 dias; casos e mensagens 180 dias depois de fechados; `optouts` sem prazo.

## 3. Fluxos

### Conectar a Yampi (compartilhado com o Rastreio)

1. O lojista cola alias + token + chave (Configurações › Integrações; o mesmo cartão aparece em Recuperar ›
   Ajustes).
2. O servidor testa com uma leitura barata (ex.: 1 pedido). 401 → "credencial inválida".
3. Cria o aviso na Yampi com a URL fixa `https://app.girumo.com.br/api/integracoes/yampi/webhook?c=<id da
   conexão>` e os 5 eventos. Já existe aviso nosso pra essa URL → reaproveita.
4. Credenciais e `secret_key` selados com `lib/security/secret-box.ts` (AES-256-GCM, AAD `tenant:campo`), como
   em `bling_connections`. A tela só mostra o final do token.
5. Desconectar apaga o aviso na Yampi (melhor esforço) e as credenciais.

### Aviso da Yampi (webhook)

- Rota fixa `POST /api/integracoes/yampi/webhook`, incluída em `PROVIDER_WEBHOOKS`
  (`lib/security/request-access-policy.ts`, casamento por path exato — por isso a conexão vai no `?c=`, não no
  path).
- Lê o corpo cru e acha a conexão pelo `c`. Confere o `X-Yampi-Hmac-SHA256` com comparação de tempo constante,
  e confere que `merchant.alias` é o alias da conexão. Qualquer falha → 401 sem detalhe.
- Grava em `yampi_events` (dedupe) e responde 200 em menos de 5 s. Processa em `after()` (padrão do Bling).
- O processamento é idempotente e aceita aviso fora de ordem (pago antes de criado → o caso já nasce fechado).
  O P1 do Pix é agendado ali mesmo.

### Cron `/api/cron/recuperar` (a cada 5 min, `CRON_SECRET`, em `vercel.json`)

1. **Agendador.** Pega os casos com `next_step_at` vencido e confere, nesta ordem:
   1. o caso continua ativo;
   2. o telefone não está bloqueado (1.1);
   3. horário, pausa e teto do dia;
   4. no carrinho, que ele ainda não virou pedido.

   Passou → escolhe o script e a versão, preenche os campos, grava `recovery_messages` (`na_fila`) e cria o
   comando no `engine_commands` (tipo de DM, `instance_id` do número da recuperação, `dedupe_key` =
   caso:passo, `available_at` espaçado pelo intervalo). Não coube hoje → próximo horário, se ainda vale.
   Comando de DM cancelado por atraso (worker fora mais de 15 min) volta pro agendador se o passo ainda vale.
2. **Reconciliação**, numa execução sim, numa não, por loja com o add-on:
   - pedidos Pix aguardando nas últimas 24 h;
   - carrinhos das últimas 72 h;
   - aviso ativo na Yampi (`active` / `disabled_at` → recria se caiu).

   401 → conexão `credencial_invalida`, aviso no sino, e a recuperação daquela loja para. Respeita ~60 req/min
   (olha `X-RateLimit-Remaining` e espalha as lojas).
3. **Limpeza** da retenção (seção 2).

### Envio (worker)

- Tipos novos de comando: DM de texto e DM com imagem.
- **Trava nos dois sentidos, com teste:** DM só sai de instância `privado` que atende o módulo do comando;
  comando de grupo só sai de instância `grupos`. Hoje essa trava não existe de verdade: o `safeDestination`
  do `send-dry-run.ts` só mascara o log no modo de teste. Ela passa a valer no claim e no sender.
- **Alvo:** só o JID resolvido do caso (`<dígitos>@s.whatsapp.net`). Corrigir `jidToNumber` em
  `apps/worker/src/send-command.ts`: hoje ele corta o `@lid` e mandaria o LID como se fosse telefone.
- **Antes da 1ª mensagem do caso:** `whatsappNumbers` (`/chat/whatsappNumbers/{instance}`), usando o JID
  devolvido (9º dígito). Se não existe → `sem_whatsapp`.
- **No claim:** intervalo por número, pausa, horário, `valid_until`. Última barreira no banco: o caso segue
  ativo e o telefone não está bloqueado (1.1).
- **Validade em vez da tolerância de 15 min:** o comando de DM não cai na `app.missed_send_tolerance()`. Passou
  do `valid_until` (Pix: o vencimento; carrinho: o fim do horário do dia), é cancelado e o agendador decide.
- **Resultado:** o sender guarda o `key.id` da Evolution e o status no comando (hoje a resposta do envio é
  descartada). Se a resposta do envio trouxer o `@lid` da cliente, grava em `recovery_conversations.lid`.
- Erro de restrição → pausa imediata (1.6).

### Resposta da cliente (webhook da Evolution)

- **Onde muda:** hoje o 1:1 é descartado em `applyFlashOfferComment` ("conversa privada nunca é capturada",
  `apps/web/src/app/api/webhooks/evolution/route.ts`). Entra um ramo novo antes dele: instância `privado`
  e `remoteJid` fora de `@g.us` → privado. Todo o resto continua igual. Grupo chegando no número de privado é
  ignorado.
- **Casar com a conversa:**
  - `@s.whatsapp.net` → pelo telefone;
  - `@lid` → pelo `recovery_conversations.lid` (aprendido no `whatsappNumbers` ou na resposta do envio), ou
    pelo telefone que vier ao lado (`remoteJidAlt` / `senderPn`). A Fase 0 escolhe a regra;
  - não casou → conversa "número não identificado", com o nome do perfil e o botão "vincular à cliente" (a
    pessoa escolhe o caso). Um SAIR vindo dela fica em destaque até alguém vincular.
- **Sem ligação determinística na Fase 0, o automático não liga:** sem casar a resposta, o caso não para e o
  SAIR não é garantido. Volta pro Igor com o resultado da prova.
- `fromMe` que não saiu da Girumo (alguém respondeu pelo celular do chip) entra no histórico como "pelo celular".
- **Resposta com caso ativo:** o caso vira `respondeu` e os passos pendentes são cancelados (comando e
  mensagem). A conversa vai pra "Precisa de você", ganha +1 não lida, e o sino avisa ("Ana respondeu").
- **SAIR:** palavra sozinha — SAIR, PARAR, STOP, CANCELAR, DESCADASTRAR — sem diferença de caixa ou acento.
  Segue 1.4.
- **Recusa:** sinal, e o link automático do carrinho não sai.
- Resposta normal à C1 com "responder com link" ligado → 1 mensagem com o link, no ritmo do número.
- **Mídia recebida:** guarda o tipo e o id. O painel busca na Evolution na hora (ouvir/ver) e não guarda o
  arquivo.
- `messages.update` (entregue/lida) → status do comando pelo `key.id`. Hoje esse evento vai cru pro
  `engine_events`, sem consumidor. É o mesmo status que o Rastreio mostra em Entregas.

### Base do privado: o que muda no código que já existe (comum com o Rastreio)

Levantado pela sessão do Rastreio em 29/10. Os três primeiros itens foram conferidos no código e batem.

- **Seletores do "número da loja" passam a filtrar `purpose = 'grupos'`.** Hoje `app.enqueue_broadcast` pega
  o número `connected` mais recente: um número de privado recém-conectado passaria a postar nos grupos. A
  lista conhecida:
  - `app.enqueue_broadcast`;
  - `pickSendInstance` em `apps/worker/src/grow-deps.ts` e `bulk-deps.ts`;
  - `apps/worker/src/recount-loop.ts`;
  - `lib/groups/sincronizar.ts`;
  - `selectSessionRow` e quem usa (página Conectar, `lib/session-store.ts`, `/api/cron/emails`);
  - `reconciliarConexoes`;
  - `/api/relampago/offers`;
  - `lib/bio/conferir.ts`;
  - `/api/instances/health`.

  Já o "esse telefone é nosso?" (`ourPhones`, no webhook da Evolution) continua olhando todos os números.
- **Limite do plano conta só `grupos`.** `assertPlanLimit("instances:create")` conta a tabela inteira
  (`CAPABILITY_TABLE`): no Essencial, o número de privado travaria a criação. O privado é liberado pelo add-on.
- **`isOptedOut` compara dígitos exatos** → a barreira do DM usa `phone_key()` (1.1).
- **Disjuntor de saídas (#525) e `app.instance_caps` só valem pra `grupos`.** Hoje o disjuntor é por loja e
  cancela a fila inteira, e o teto do `instance_caps` sai da contagem de grupos (daria zero pro número de
  privado).
- **Tolerância de 15 min** → validade própria do DM (seção "Envio").
- **Status por mensagem** → `key.id` guardado e `messages.update` consumido (seções "Envio" e "Resposta").
- **Trava anti-DM de verdade** (seção "Envio").

### Conectar o número de privado

- Mesmo fluxo de QR / código de pareamento das instâncias, com `purpose = 'privado'` e os módulos que ele
  atende.
- Exige um add-on que use o privado. 1 número por módulo, ou o mesmo pros dois (seção 12).
- Recusa (desconecta e explica) se o telefone for o mesmo de uma instância `grupos` da loja.
- Fica fora da sincronização de grupos e dos destinos de post.
- O alerta de número caído (Job 3 do `/api/cron/emails`) tem que cobrir essa instância — conferir.

### Cobrança e liberação (molde do Instagram)

- Assinatura Stripe separada, `metadata.addon = 'recuperar'`, preço em `STRIPE_PRICE_RECUPERAR` (R$ 127/mês),
  sem implantação. Exige plano ativo.
- O webhook do Stripe liga e desliga `tenant_settings.recuperar_enabled` (como `instagram_enabled`).
- `requireRecuperar()` em toda rota do módulo, 403 `recuperar_disabled` (como `requireInstagram` em
  `lib/ig/access.ts`).
- Admin libera e desliga na mão, pra loja piloto.
- **Desligou:** o automático para na hora; o número continua conectado (o lojista desconecta se quiser); as
  telas mostram Ativar; os dados ficam pra consulta até a retenção.
- Na ativação, o lojista confirma que avisa no site ou na política de privacidade que pode falar com a cliente
  pelo WhatsApp sobre pedido e carrinho. O texto fica pra revisão do Igor.

## 4. Telas (ver mockup)

| Tela | O que tem de essencial |
|---|---|
| Barra de cima | "Recuperar" com contador de "precisa de você" pra quem tem o add-on (sem rolagem lateral a 1024 px; se não couber, vai pro Mais). Sem o add-on: em Mais › Vender, abrindo Ativar |
| Hoje | Números do mês (recuperado, taxa com × sem mensagem, precisa de você, conversas novas X de teto), fila filtrável (Todos, Precisa de você, Pix, Carrinho, Recuperados), Ritmo do número, recuperado por dia |
| Conversas | Lista com filtros e busca · conversa · pedido e sequência do lado. Scripts preenchidos, botão de depoimento, envio que entra na fila. No celular, uma coluna por vez (lista → conversa → pedido em folha). Polling: lista a cada 30 s, conversa aberta a cada 5 s (só mensagens novas) |
| Automático | Ritmo do número, "tudo para quando", grupo de controle, as duas sequências com esperas e textos |
| Scripts e depoimentos | Lista (automático e chat) com resultado, editor com campos, versões A/B e conferência; depoimentos com autorização |
| Ajustes | Yampi, número da recuperação, como a loja assina, números da equipe (ficam fora dos casos e recebem os testes), quem atende (atalho pra Equipe) |
| Ativar | Preço e o que inclui; depois do pagamento, 4 passos: Yampi, número, assinatura, testar e ligar |

"Testar no meu WhatsApp" manda os passos, com dados de exemplo, só pra um número da equipe cadastrado em
Ajustes (os mesmos que ficam fora dos casos). São até 3 testes por dia, pelo mesmo caminho dos outros envios
(horário, intervalo, teto de mensagens do dia), e eles não entram nos números. Um SAIR vindo do número de teste
vale como qualquer outro.

## 5. Acesso

| Papel | Hoje e Conversas | Automático, Scripts, Ajustes | Ativar e cancelar |
|---|---|---|---|
| Dono, admin | sim | sim | sim |
| Operador | sim | sim | não |
| Vendedora com o módulo `recuperar` | sim (scripts no chat inclusos) | não | não |

O módulo novo entra em `lib/auth/modulos.ts` (ROTAS e PAGINAS), no CHECK de `memberships.modules`, na guarda
de página, no menu e na tela de Equipe.

## 6. Segurança e LGPD

- **Credenciais:** seladas, nunca voltam pro navegador.
- **Aviso da Yampi:** HMAC de tempo constante, rota na allowlist, com teste nos dois casos (assinado e não
  assinado).
- **Conteúdo:** nunca mandar `simulate_url`. `{nome}` higienizado (1.9).
- **Envio manual:** até 1000 caracteres; até 30 envios por minuto por pessoa.
- **Logs:** código Pix e telefone nunca vão pra log (`log.ts` já proíbe dado pessoal).
- **Retenção:** como na seção 2. SAIR vale na hora e pra sempre.
- **Antes de ligar o carrinho** pra qualquer loja: teste de balanceamento do legítimo interesse escrito (é
  documento, não código).

## 7. Erros e bordas

| Situação | Comportamento |
|---|---|
| Aviso fora de ordem ou repetido | Upsert por id, dedupe; nada sai duas vezes (`dedupe_key` caso:passo) |
| Carrinho e Pix da mesma cliente | O carrinho fecha "virou pedido", o Pix segue |
| Pedido feito pelo lojista no admin da Yampi | Vira caso como qualquer outro (a prova 0 vê se dá pra distinguir) |
| Número da recuperação desconectado ou VPS fora | Nada sai; o passo que perder a janela vira `perdido`; o alerta de número caído avisa |
| Yampi fora ou 429 | A reconciliação tenta de novo, respeitando o limite |
| Lojista trocou a senha da Yampi | 401 → `credencial_invalida`, aviso, a recuperação da loja para |
| Aviso desativado na Yampi (30 falhas) | A reconciliação recria |
| Cliente responde dias depois | A conversa volta pra "Precisa de você" |
| Campo vazio no script | O passo vai pra mão |
| Add-on cancelado com casos em andamento | Param |

## 8. Fase 0 — provas antes de código de produto

Precisa do Igor: a credencial Yampi da loja piloto, um Pix real pago (valor simbólico serve), um chip de
teste, dois celulares e uma instância de teste na Evolution. Os PRs 1, 2 e 5 andam antes dela (seção 9).

1. **Yampi de verdade** (loja piloto, credencial dela): capturar `cart.reminder`, `order.created` com Pix,
   `order.paid` e `order.status.updated` reais. Confirmar:
   - o formato do telefone;
   - qual link abre o carrinho sem logar, e qual link de pedido serve de plano B quando não vem o código Pix
     (também sem login embutido);
   - `pix_qr_code` no formato EMV (`000201…`) e o fuso de `pix_expiration_date`;
   - o `cart_token` no pedido;
   - se pedido feito no admin da Yampi é distinguível;
   - criar e apagar o aviso por API (`POST /webhooks`) com a credencial do lojista;
   - as listagens da reconciliação (Pix aguardando nas últimas 24 h, carrinhos das últimas 72 h).

   Saída: payloads anonimizados como fixtures.
2. **Mensagem no privado de verdade** (instância de teste e dois celulares de teste). Mandar 1:1 pra um
   telefone e olhar:
   - o `whatsappNumbers` (9º dígito; devolve o `@lid`?);
   - a resposta do envio (`key.id`; o `key.remoteJid` vem em `@lid`?);
   - o `messages.upsert` da resposta (`remoteJid`, `remoteJidAlt`, `senderPn`);
   - o `messages.update` (entregue/lida com o id);
   - imagem com legenda por URL assinada;
   - mídia recebida buscada em base64;
   - o formato do erro de envio que dá pra provocar (número sem WhatsApp). O 463 não se provoca: tratar pelo
     código quando aparecer.

   Saída: fixtures e a regra de como casar a resposta.

   **Go/no-go do automático:** precisa de pelo menos um caminho determinístico entre a resposta e o telefone:
   o `@lid` vindo no `whatsappNumbers` ou no envio, ou o telefone vindo ao lado na resposta. O fixture de julho
   (`apps/web/src/lib/evolution/__fixtures__/messages-update.json`) já mostra um 1:1 em `@lid`.

## 9. Fatias (PRs)

Antes do PR 1: abrir o card `recuperar-yampi` no quadro. Os PRs marcados "comum" servem também ao Rastreio:
quem chegar primeiro faz, o outro só usa.

| PR | O que entrega | Depende de |
|---|---|---|
| 1 · Banco | Tabelas da seção 2, `instances.purpose` e `private_modules`, `tenant_settings.recuperar_enabled`, módulo no CHECK, RLS, função de limpeza | — |
| 2 · Número de privado (comum) | Filtro `grupos` nos seletores da "Base do privado", limite do plano só com grupos, disjuntor e `instance_caps` só pra grupos, conectar o número de privado | 1 |
| 3 · Envio de DM (comum) | Comando com módulo e `valid_until`, trava nos dois sentidos, ritmo por instância, `whatsappNumbers`, correção do `jidToNumber`, barreira de bloqueio por `phone_key()`, `key.id` guardado | 2 e prova do WhatsApp |
| 4 · Resposta 1:1 e status (comum) | Ramo no webhook da Evolution, casar conversa pela regra da Fase 0, "vincular à cliente", `messages.update` → status, SAIR → `private_optouts`, sinais e pausa, sino | 3 |
| 5 · Cobrança e casca | Stripe (preço, checkout, webhook → flag), `requireRecuperar`, barra e Mais, Ativar, liberação no admin | 1 |
| 6 · Conexão Yampi (comum) | Conectar, testar e desconectar; aviso (rota, HMAC, allowlist, `yampi_events`); reconciliação; cartão em Integrações e Ajustes | 1 e prova da Yampi |
| 7 · Pix automático | Eventos → casos, agendador, scripts padrão do Pix, controle, Hoje, Ajustes, os 4 passos de ativação, testar no meu WhatsApp. **Piloto do Pix** (respostas no celular do chip até o PR 8) | 4, 5, 6 |
| 8 · Conversas | Tela de 3 colunas e celular, envio manual, scripts no chat, mídia sob demanda, módulo da vendedora | 7 |
| 9 · Carrinho automático | C1 a C3, link na resposta, reconferência na Yampi, depoimento na C2, Automático (carrinho), teste de balanceamento escrito antes de ligar | 7 |
| 10 · Scripts e depoimentos | Editor com A/B e conferência, upload com redução e autorização, contadores | 9 |
| 11 · Medição | Números com controle, gráfico, card do quadro em `no_ar_verificado` com prova | 10 |

Antes da Fase 0 andam os PRs 1, 2 e 5. Depois do 1, os PRs 2, 5 e 6 mexem em arquivos separados e podem andar
juntos.

## 10. Testes

- **Unidade:**
  - política (teto, rampa, horário, intervalo, prioridade);
  - regras de parada;
  - preenchimento e higiene dos campos;
  - SAIR e recusa;
  - HMAC (válido, inválido, alias trocado);
  - montagem do telefone;
  - trava de `purpose` nos dois sentidos;
  - `jidToNumber` com `@lid`;
  - DM vencido (`valid_until`) cancelado, e DM dentro da validade fora da tolerância de 15 min.
- **Base do privado:** com um número de privado conectado mais recente que o de grupos, `enqueue_broadcast` e
  os outros seletores continuam escolhendo o de grupos; o limite do plano não conta o privado; o disjuntor de
  saídas não cancela DM.
- **Integração** (job e2e contra o banco dev): RLS das tabelas novas (vendedora sem módulo não lê); aviso →
  caso → comando.
- **E2E:** Hoje e Conversas na loja de QA (sem número conectado: estado vazio).
- **Mutante:** remover a trava de `purpose` tem que derrubar um teste.

## 11. O que fica com quem constrói

- Nomes finais de tabela, coluna, tipo de comando, arquivo e componente.
- Como sortear o intervalo (dentro de 40–120 s) e como espalhar a reconciliação entre lojas.
- O texto final dos scripts padrão, partindo do mockup e das regras de 1.9.
- Paginação, índices e a forma do polling.

## 12. Perguntas em aberto

1. **Mesmo chip pro Recuperar e pro Rastreio, ou um cada?** A base funciona com os dois (`private_modules`).
   O que muda:
   - a cobrança: com um chip só, o primeiro add-on ativo libera o número e o segundo usa o mesmo;
   - Conversas: passa a mostrar também quem respondeu aviso de pedido;
   - o teto do dia: dividido, com prioridade Pix > aviso de pedido > carrinho.

   Recomendação: um só. A lojista mantém um chip a mais em vez de dois, e a cliente recebe tudo do pós-venda na
   mesma conversa. Contra: uma restrição causada pelo carrinho atrasa também o aviso de quem comprou.
