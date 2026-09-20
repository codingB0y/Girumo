# Funil de disparos — design

**Data:** 19/09/2026 · **Status:** aguardando revisão do Igor · **Mockup:** https://claude.ai/artifact/6aw3vfm7oFpX6ETEg3SBH8 (direção C + prévia de celular da B)

## 1. Problema

O lojista de atacado sabe *o que* quer vender, mas monta o ritual de venda no
grupo na mão, toda vez: aviso, prévia, abertura, reforço, sobras. Cada mensagem
é agendada solta na sub-aba **Agendar**, sem estrutura, e o timing que faz o
grupo comprar (grade às 06:00, link com vagas 12 minutos depois, relâmpago
logo depois da live) se perde.

O funil resolve isso: o lojista escolhe um **roteiro pronto**, informa a data
âncora e os dados da loja e da peça, revisa cada mensagem e confirma. Cada etapa
vira um agendamento comum.

## 2. Decisões

### D1 — Funil é modelo que pré-preenche agendamentos comuns

Um roteiro é um módulo TypeScript puro, como `campaign-presets.ts`. Ao
confirmar, cada etapa marcada vira exatamente o par `broadcasts` + `schedules`
que a sub-aba Agendar já cria, pela mesma rota `POST /api/campanhas/[slug]/messages`.

Consequências: nenhum código novo no worker; o ritmo anti-ban continua decidido
no banco (`claim_send_commands`); cancelar é por mensagem, na Agenda, como hoje;
os gates de plano (`campaigns:send`, `contacts:reach`) e o gate de sessão viva
valem por etapa, sem exceção.

Rejeitado: tabela `funnels` com motor próprio. Duplicaria o pipeline de disparo
que já funciona e já tem anti-ban.

### D2 — Copy genérica; o lojista preenche campos, não reescreve texto

A copy de cada etapa é a mesma para todo lojista. Ela lê **campos da loja**
(`{loja}`, `{nicho}`), **campos da âncora** (`{dia}`, `{hora}`) e **campos da
etapa** (`{peça}`, `{preço}`, `{grade}`, `{quantidade}`, `{link}`).

A substituição acontece **no cliente, na hora de confirmar**. O que vai para
`broadcasts.message` é texto final, sem placeholder. O banco e o worker nunca
veem chaves.

O lojista pode abrir "Editar texto" e alterar a mensagem gerada; a partir daí a
etapa é texto livre e os campos param de regenerar aquela mensagem.

Campo obrigatório vazio bloqueia o botão de confirmar e marca a etapa.

### D3 — Etapa relâmpago abre a Oferta Relâmpago no instante do disparo

Uma etapa do tipo `relampago` cria uma Oferta Relâmpago em **rascunho**
(`POST /api/relampago/offers`: `name` = nome da etapa, `keyword` = "eu quero",
`slots` = `{quantidade}`, `groupIds` = grupos da campanha) ligada ao broadcast
da etapa por `flash_offers.broadcast_id`.

A abertura acontece dentro de `app.promote_due_schedules`: ao promover um
agendamento cujo broadcast tem oferta em rascunho ligada, a função faz o que o
botão **Abrir** faz hoje (status → aberta, `opened_at`, uma linha em
`flash_offer_groups` por grupo). Tudo em SQL, na mesma transação da promoção.
Diferença única: o mapa `@lid → telefone` vem só do histórico de
`engine_events` (porte SQL de `lidMapFromHistory`), sem a chamada ao vivo à
Evolution que o Abrir manual faz. Quem ficar sem telefone aparece na fila com
"responder no grupo", o mesmo fallback que já existe.

Grupo que já tenha outra oferta aberta (índice único) é pulado com
`on conflict do nothing`; a mensagem sai mesmo assim. O caso é raro e o lojista
vê a oferta parcial na tela de Relâmpago.

Rejeitado: `opens_at` em `flash_offers` com job próprio. É um segundo
agendador para o mesmo instante.

### D4 — Etapa link insere o link mestre da campanha

Etapa do tipo `link` recebe `{link}` = `https://<host>/r/<slug>` da campanha.
Sem link encurtado novo, sem tabela nova; o `/r/` já roteia para o próximo
grupo com vaga.

### D5 — Rastreio mínimo: duas colunas em `broadcasts`

`broadcasts.funnel_template_id text` e `broadcasts.funnel_run_id uuid`,
nullable. O `funnel_run_id` é gerado no cliente ao confirmar e enviado nas N
chamadas. É o que permite a Agenda mostrar "Live 10/10 · 3/4" e, na v2,
Resultados por funil.

### D6 — Só grupo, nunca DM

Inalterado. Nenhum roteiro manda nada sozinho: cada etapa é confirmada pelo
lojista e sai pelo mesmo caminho dos disparos comuns.

### D7 — Direção visual: C (Balcão editorial) com prévia de celular por etapa

Uma coluna guiada de 760 px, seções 01/02/03 em Instrument Serif itálico,
cards em duplo bisel, hero Aurora VIP (única peça escura da tela). A etapa
aberta mostra os campos e, logo abaixo, o balão do WhatsApp com a mensagem
final. Mobile-first: no celular a coluna é a tela inteira.

Rejeitadas: A (três painéis) por ser densa demais para o lojista no celular;
B como base por apertar o formulário em roteiros de 7 etapas. A prévia de
celular da B entra como componente.

### D8 — Etapa no passado fica desmarcada

Se a âncora escolhida deixa uma etapa antes de agora, ela aparece desmarcada
com aviso "já passou" e não é enviada. Nada sai retroativo.

## 3. Os quatro roteiros

Convenções: `D` = dia da âncora. Hora fixa quando indicada; `âncora ± min`
quando depende da hora da âncora. Tipos: `texto`, `midia` (texto + **1 foto**,
porque `broadcasts` tem um `media_id` só), `link`, `relampago` (também aceita
1 foto). `@todos` = `mention_all`. Negrito na copy é `*texto*`, a sintaxe do
WhatsApp.

Campos da loja (uma vez, persistidos): `{loja}`, `{nicho}`.
Campos da âncora, gerados: `{dia}` = "sábado, 10/10"; `{hora}` = "20h".
Campos da etapa: `{peça}` e `{grade}` texto livre; `{preço}` texto livre com
máscara sugerida "R$ 0,00"; `{quantidade}` **número inteiro** (vira `slots`
da oferta e sai na copy como "{quantidade} peças").

### 3.1 Grade do dia (3 mensagens) — âncora: dia da grade

| Etapa | Quando | Tipo | Campos | Copy |
|---|---|---|---|---|
| Grade de hoje | D 06:00 | relampago + foto, @todos | peça, preço, grade, quantidade | Bom dia! Grade de hoje da {loja}: {peça} por {preço} no atacado, grade {grade}. Só {quantidade} peças. Quer? Manda *EU QUERO* aqui no grupo que eu separo a sua. |
| Vagas de hoje | D 06:12 | link | — | Pra quem ainda não entrou: o link de pedido da {loja} é este, com as vagas de hoje: {link} |
| Últimas da grade | D 12:00 | texto | — | Sobrou pouca coisa da grade de hoje. Quem mandou EU QUERO já está na fila; quem ficou de fora ainda pega o que restou por aqui. |

### 3.2 Evento de 2 dias (7 mensagens) — âncora: dia 1, 06:00

| Etapa | Quando | Tipo | Campos | Copy |
|---|---|---|---|---|
| Vem aí | D−2 19:00 | midia | — | {dia} tem evento de 2 dias da {loja}, só pra quem está nos grupos: {nicho} com preço de atacado que não vai pro site. Guarda a data. |
| Prévia | D−1 19:00 | midia | peça, preço, grade | Amanhã 06:00 abre. Prévia: {peça} a partir de {preço}, grade {grade}. Quem estiver no grupo às 6 pega primeiro. |
| Abriu · dia 1 | D 06:00 | relampago + foto, @todos | peça, preço, grade, quantidade | Abriu! Dia 1 do evento da {loja}: {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO* que eu separo na ordem. |
| Ainda dá tempo | D 12:00 | texto | — | Meio-dia e o evento segue. O que saiu de manhã não volta; o que sobrou está por aqui. |
| Abriu · dia 2 | D+1 06:00 | relampago + foto, @todos | peça, preço, grade, quantidade | Dia 2! Nova grade da {loja}: {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO*. |
| Última chamada | D+1 18:00 | link, @todos | — | Última chamada do evento. Pedido pelo link até hoje à noite: {link} |
| Sobras | D+2 10:00 | link | — | Sobras do evento com o mesmo preço, enquanto durar: {link} |

### 3.3 Lançamento de live (4 mensagens) — âncora: dia e hora da live

| Etapa | Quando | Tipo | Campos | Copy |
|---|---|---|---|---|
| Prévia da grade | D−1 19:00 | midia | peça, preço, grade, quantidade | Amanhã {hora} tem live da {loja}! Prévia da grade de {nicho}: {peça} a partir de {preço} no atacado, grade {grade}, {quantidade} peças. Quem estiver ao vivo leva condição exclusiva. |
| Entra agora | âncora −15 min | link, @todos | link da live | Tô entrando ao vivo em 15 min! Entra aqui: {link da live}. Pedido é pelo grupo, na condição da live. |
| Grade da live | âncora +90 min | relampago + foto | peça, preço, grade, quantidade | Grade da live liberada: {peça} {preço}, {grade}. Só {quantidade} peças. Manda *EU QUERO* aqui que eu separo a sua. |
| Sobras da live | D+1 10:00 | link | — | Sobrou da live e ainda está na condição de ontem. Pedido por aqui: {link} |

`{link da live}` é campo da etapa, não da campanha (URL do Instagram/YouTube).

### 3.4 Black Friday do atacado (7 mensagens) — âncora: dia da BF do atacado

O seletor de data sugere **3 semanas antes** da última sexta de novembro: a
revendedora compra antes para revender na BF do varejo.

| Etapa | Quando | Tipo | Campos | Copy |
|---|---|---|---|---|
| Vem aí | D−7 19:00 | midia | — | Black Friday do atacado da {loja} é {dia}. Antes da BF das lojas, pra você revender na BF delas. Só nos grupos. |
| Prévia | D−3 19:00 | midia | peça, preço, grade | Prévia da Black do atacado: {peça} vai sair por {preço}, grade {grade}. Na {dia} às 06:00. |
| Véspera | D−1 19:00 | texto, @todos | — | Amanhã 06:00. A grade sai aqui no grupo primeiro; quem mandar EU QUERO cedo pega. |
| Abriu | D 06:00 | relampago + foto, @todos | peça, preço, grade, quantidade | Abriu a Black do atacado da {loja}! {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO* que eu separo na ordem. |
| Reforço | D 12:00 | texto | — | Metade do dia e metade da grade já foi. O que sobrou continua no mesmo preço até hoje à noite. |
| Última chamada | D 18:00 | link, @todos | — | Última chamada da Black do atacado. Pedido pelo link até meia-noite: {link} |
| Sobras | D+1 10:00 | link | — | Sobras da Black no mesmo preço, enquanto durar: {link} |

**Coleção nova** e **Queima de estoque** não são roteiros próprios: são o
Evento de 2 dias com outro nome de campanha. Entram como sugestão de nome no
seletor, não como estrutura.

## 4. Modelo de dados

### 4.1 Módulos puros (sem I/O, testáveis)

`apps/web/src/lib/funnels/templates.ts`

```ts
export type FunnelStepKind = "texto" | "midia" | "link" | "relampago";
export type FunnelField = "peça" | "preço" | "grade" | "quantidade" | "link da live";

export type FunnelStep = {
  id: string;                 // "grade-de-hoje"
  label: string;              // "Grade de hoje"
  at: { days: number; time?: string; minutes?: number }; // time="06:00" | minutes=-15 (relativo à hora da âncora)
  kind: FunnelStepKind;
  fields: FunnelField[];      // obrigatórios pra gerar a copy
  mentionAll: boolean;
  wantsMedia: boolean;        // sugere fotos; não obriga
  copy: string;               // com {chaves}
};

export type FunnelTemplate = {
  id: "grade-do-dia" | "evento-2-dias" | "live" | "black-friday-atacado";
  label: string;
  anchorLabel: string;        // "Dia da grade" | "Dia 1" | "Dia e hora da live" | "Dia da BF do atacado"
  anchorNeedsTime: boolean;   // só a live
  suggestAnchor?: (today: Date) => Date; // BF: 3 semanas antes da última sexta de novembro
  steps: FunnelStep[];
};
export const FUNNEL_TEMPLATES: FunnelTemplate[];
```

`apps/web/src/lib/funnels/render.ts`

```ts
export function resolveStepDate(anchor: Date, step: FunnelStep): Date; // hora local do navegador
export function anchorValues(anchor: Date): { dia: string; hora: string };  // "sábado, 10/10" · "20h"
export function renderCopy(copy: string, values: Record<string, string>): string; // troca {chaves}; lança se faltar obrigatória
export function missingFields(step: FunnelStep, values: Record<string, string>): FunnelField[];
```

Fuso: hora local do navegador, exatamente como a sub-aba Agendar monta o
`scheduledAt` (`new Date(`${date}T${time}`).toISOString()`).

### 4.2 Migração (dev + prod + baseline de drift)

```sql
alter table public.broadcasts
  add column if not exists funnel_template_id text,
  add column if not exists funnel_run_id uuid;
create index if not exists broadcasts_funnel_run_idx
  on public.broadcasts (tenant_id, funnel_run_id) where funnel_run_id is not null;

alter table public.flash_offers
  add column if not exists broadcast_id uuid references public.broadcasts(id) on delete set null;
create unique index if not exists flash_offers_broadcast_uidx
  on public.flash_offers (broadcast_id) where broadcast_id is not null;
```

`app.promote_due_schedules` ganha, após o `enqueue_broadcast`, o bloco que
abre a oferta em rascunho ligada ao broadcast (mesma lógica do Abrir:
`update flash_offers set status = 'open', opened_at = now()`; `insert into
flash_offer_groups (...) select ... on conflict do nothing`). `security
definer` com `set search_path`, como hoje. Conferir por SQL nos dois bancos
antes de escrever, e rodar o advisor depois.

### 4.3 Campos da loja

`{loja}` = nome da organização (já existe). `{nicho}` grava em
`organizations.niche text`; se o plano encontrar um campo de segmento já
existente na organização, usa esse em vez de criar coluna. Editáveis na
própria seção 02 do funil; a primeira vez preenche, as próximas já vêm.

### 4.4 API

Sem rota nova. Duas rotas existentes ganham campos opcionais:

- `POST /api/campanhas/[slug]/messages`: `funnelTemplateId?: string` (tem
  de ser um id de `FUNNEL_TEMPLATES`, senão 400), `funnelRunId?: string`
  (uuid, senão 400). Ignorados se ausentes.
- `POST /api/relampago/offers`: `broadcastId?: string` (uuid de broadcast do
  próprio tenant, senão 400).

Ordem de confirmação, por etapa marcada, em série: cria a mensagem (recebe
`id`); se `relampago`, cria a oferta com `broadcastId`. Falhou uma etapa: para,
mostra quais já foram agendadas (estão na Agenda, canceláveis) e qual falhou.
Sem transação entre as N chamadas na v1.

## 5. Fluxo na tela

Sub-aba **Funil** (chip "Novo") na aba Mensagens da campanha, ao lado de Enviar
agora · Agendar · Agenda.

1. **Hero** (escuro): nome do roteiro, frase editorial, contagem de mensagens,
   grupos, revendedoras e ofertas relâmpago do roteiro.
2. **01 Roteiro**: pílulas com os 4 roteiros + "Do zero" (abre a sub-aba
   Agendar comum).
3. **02 Quando, e de quem**: âncora (data; data+hora na live), `Sua loja`,
   `Seu nicho`.
4. **03 As N mensagens**: um card por etapa, com checkbox de incluir, data e
   hora calculadas, chips de tipo (`@todos`, `link`, `relâmpago · EU QUERO`,
   `foto`). A etapa aberta mostra os campos da etapa, a foto (upload pelo
   `POST /api/media` que já existe) e a **prévia de celular**: balão do grupo
   com a mensagem final. Botões: `@Todos`, `Editar texto`.
5. **Rodapé**: "Nada sai sem você confirmar" + botão pílula **Agendar N
   mensagens** (N = marcadas e válidas). Desabilitado enquanto houver campo
   obrigatório vazio; etapa no passado fica desmarcada com aviso.
6. **Agenda**: cada mensagem do funil ganha chip `Live · 1/4`, `2/4`…
   (agrupado por `funnel_run_id`, ordenado por data). A data já está na
   própria linha. Cancelar continua por mensagem.

Componentes novos (`apps/web/src/components/painel/messages/funnel/`):
`funnel-tab.tsx` (estado, confirmação), `funnel-hero.tsx`,
`funnel-step-card.tsx`, `whatsapp-preview.tsx` (balão reutilizável),
`store-fields.tsx`. Reutiliza o uploader e os helpers de data de
`schedule-composer.tsx`.

## 6. Erros e limites

| Situação | Comportamento |
|---|---|
| Campo obrigatório vazio | etapa marcada em vermelho, botão desabilitado |
| Etapa no passado | desmarcada, aviso "já passou", não bloqueia as outras |
| Sessão do WhatsApp não viva | mesmo erro da sub-aba Agendar, antes da 1ª chamada |
| Limite do plano estourado no meio | para na etapa que falhou; lista o que já foi agendado |
| Grupo já com oferta aberta na hora | `on conflict do nothing`; mensagem sai; oferta parcial |
| Lojista editou o texto e depois mudou um campo | texto editado prevalece; aviso "texto editado à mão" |

## 7. Testes

- `templates.test.ts`: todo roteiro tem etapas em ordem cronológica; toda
  chave na copy está em `fields` ou é campo da loja/âncora; ids únicos.
- `render.test.ts`: `resolveStepDate` com `time` e com `minutes`, virada de
  dia, horário de verão; `renderCopy` lança em campo faltando; `missingFields`.
- SQL: não há suíte pgTAP no repo. A `promote_due_schedules` nova é provada
  por SQL nos dois bancos com um agendamento de teste vencido: oferta ligada
  abre, grupo já com oferta aberta é pulado. Registrar o resultado no PR.
- Componente: card abre, prévia reflete os campos, botão desabilita.
- E2E: escolher Live, preencher, confirmar → 4 linhas na Agenda com o chip;
  a 3ª tem oferta em rascunho ligada.

## 8. Entrega

Dois PRs, nesta ordem, cada um a partir de `origin/main` em worktree próprio:

1. **Motor**: migração (dev + prod + baseline de drift), módulos puros com
   testes, campos opcionais nas duas rotas, chip do funil na Agenda.
2. **Tela**: sub-aba Funil com os componentes da seção 5, teste de componente
   e E2E.

Card do quadro: `funil-de-disparos`, movido para `em_construcao` ao abrir o
PR 1.

## 9. Fora de escopo (v2)

Cancelar o funil inteiro de uma vez; recorrência semanal da Grade do dia;
roteiros salvos pelo lojista; Resultados por funil (o `funnel_run_id` já
permite); hora por praça (Brás × Bom Retiro × Goiânia); copy por nicho.

## 10. Riscos

- **Generalização.** Os horários vêm do ritual da Mega (infantil, Brás). Moda
  feminina da 44 pode comprar em outra hora. Mitigação: hora editável por
  etapa e validar as copies com 2 ou 3 lojistas antes do PR final.
- **Oferta parcial** quando um grupo já tem oferta aberta. Raro; visível na
  tela de Relâmpago.
- **Fuso e horário de verão** na etapa relativa (`minutes`). Coberto por teste.
- **N chamadas sem transação.** Falha no meio deixa etapas parciais na Agenda,
  mas canceláveis; a tela diz exatamente o que ficou.
