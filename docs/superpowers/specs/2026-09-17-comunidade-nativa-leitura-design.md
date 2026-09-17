# Comunidade nativa do WhatsApp — leitura e disparo pelo Avisos (design)

**Data:** 2026-09-17
**Estado:** aprovado pelo Igor em 17/09/2026
**Substitui:** a Fase 1 do spec `2026-09-04-gestao-de-comunidade-design.md` (fork da
Evolution). O fork está **cancelado em definitivo** — a justificativa está na seção 2.4.

---

## 1. O que se queria, e o que era preciso pra isso

O objetivo nunca foi "ter comunidade". Era **um disparo em vez de N**: postar uma vez
no grupo de Avisos de uma comunidade nativa e alcançar todo mundo dos grupos
vinculados, em vez de 92 envios contra caps de 120/h e 800/dia.

A leitura anterior era que isso exigia um fork da Evolution API, porque a Evolution
não expõe nenhum dos 20+ métodos de comunidade do Baileys. Essa leitura estava
**errada** — e o erro custou um fork, uma instância de infra e um número banido.

---

## 2. O que o spike mediu (17/09/2026)

Medição feita contra a Evolution de produção (`wa.girumo.com.br`, 2.3.7) com
`GET /group/fetchAllGroups/{inst}?getParticipants=false` — a mesma chamada que o sync
já faz hoje. Nenhuma escrita, nenhum pareamento, nenhum risco.

### 2.1 A Evolution já entrega os campos de comunidade

`GroupMetadata` do Baileys 7.0.0-rc.9 declara `linkedParent`, `isCommunity` e
`isCommunityAnnounce`. A dúvida era se a Evolution filtrava esses campos — ela
comprovadamente filtra outros (`fetchAllGroups` não devolve `ownerPn`, ver
`apps/web/src/lib/evolution/admin-group.ts`). **Não filtra:**

| instância | perfil | grupos | `isCommunity` | `isCommunityAnnounce` | `linkedParent` |
|---|---|---|---|---|---|
| `gr_b9f62617…` | Igor | 196 | 14 | 14 | 29 |
| `gr_41be3465…` | Mega Stock Atacado | 49 | 3 | 3 | 3 |

A estrutura inteira aparece: o grupo-pai (`isCommunity=true`), o Avisos
(`isCommunityAnnounce=true, announce=true`) e cada filho apontando para o pai via
`linkedParent`.

**Consequência: ler comunidade nativa custa zero fork.** O dado já chega no Girumo
hoje e é descartado — `EvolutionGroup` (`apps/web/src/lib/evolution/client.ts`)
declara 6 campos e nenhum deles é de comunidade.

### 2.2 As comunidades existentes estão vazias

As três comunidades da Mega Stock existem, mas **nenhum grupo está vinculado a elas**
— cada uma tem só o próprio grupo de Avisos:

```
Mega stock atacado infantil #1  -> Avisos 120363317004683243@g.us   (e mais nada)
Mega stock atacado infantil #2  -> Avisos 120363300287692953@g.us   (e mais nada)
#3 Mega stock Atacado infantil  -> Avisos 120363316092519080@g.us   (e mais nada)
```

Para contraste, uma comunidade de terceiro em que o número é apenas membro (`GLA`)
tem Avisos **+ 6 grupos** vinculados.

**Este é o achado que define o desenho.** O gargalo nunca foi ler nem disparar —
ambos já são possíveis. O gargalo é **vincular**, e é a única coisa que o fork
compraria.

### 2.3 Vincular é um mutirão, não trabalho recorrente

| tenant | grupos | membros somados | pessoas distintas |
|---|---|---|---|
| `igor@hubflow.com.br` (`9888373f…`) | 92 | 9.667 | **0 — `group_participants` não populado** |
| `Igor` (`f1622862…`) | 36 | 7.422 | 7.040 |

Ritmo de grupos novos no tenant principal: **90 em julho** (sync inicial), **1 em
agosto**, **1 em setembro**. Ou seja: um mutirão inicial de ~92 vínculos e cerca de
**um vínculo por mês** depois.

*Ressalva de honestidade: `groups.created_at` marca quando o grupo entrou no Girumo,
não quando nasceu no WhatsApp. É proxy — mas o padrão 90/1/1 é coerente com sync
inicial seguido de crescimento real.*

### 2.4 Por que o fork morre aqui

Um vínculo por mês não paga uma dívida de infra permanente. Além disso:

- Vincular 92 grupos por API é **escrita em massa**, o padrão de comportamento que o
  WhatsApp mais pune. O único dado real que temos sobre essa integração é um
  banimento (`DisconnectReason.forbidden`, 12/09/2026).
- O fork exigiria congelar na 2.3.7 para sempre (R1 do spec anterior).
- Vincular à mão **mede o teto da comunidade de graça** (R1 da seção 6): o WhatsApp
  recusa quando estoura, e a recusa não custa a conta. Era exatamente o que a Fase 0
  existia pra descobrir.

**Decisão:** o fork `evolution-girumo-community-test` e a instância `prova-comunidade`
no Coolify não serão usados. Desligá-los é trabalho separado (ver seção 7).

### 2.5 O mutirão parcial validou o desenho (17/09/2026, mesmo dia)

O Igor vinculou 8 grupos reais à `Mega stock atacado infantil #1` pelo celular. A
medição seguinte confirmou, sem nenhuma escrita pela Girumo:

| medida | antes | depois |
|---|---|---|
| `linkedParent` na instância Mega Stock | 3 | **11** |
| grupos com `linkedParent` = pai da `#1` | 0 | **8** |
| recusas do WhatsApp | — | **nenhuma** |

Os oito (`Mega Stock Atacado #104 #105 #106 #108 #110 #111 #112 #114`) aparecem
imediatamente com `linkedParent=120363314352216368@g.us`, e o Avisos da `#1` é
`120363317004683243@g.us`. Todos existem em `groups` nos dois tenants, todos com
`is_admin = true` — o filtro da seção 3.3 os alcança.

### 2.6 O alcance da comunidade já está medido — no Avisos

O dado mais valioso do mutirão não foi o vínculo, e sim o `members` de cada peça:

| grupo | papel | `members` |
|---|---|---|
| `120363317004683243` | **Avisos** da `#1` | **1.984** |
| `120363314352216368` | pai da `#1` | 1 |
| `120363047246515568` | filho (`#112`) | 59 |
| `556284947821-1556328662` | filho (`#114`) | 61 |

**O grupo de Avisos carrega a contagem de toda a comunidade, já deduplicada pelo
WhatsApp.** O grupo-pai é só um contêiner (1 membro). Isso significa que o alcance
real do disparo único é legível de um campo que a Evolution já entrega — não depende
de `group_participants`, que está vazio no tenant principal.

*Nota: os 1.984 são de um sync anterior ao vínculo dos oito grupos; a comunidade já
tinha gente adicionada diretamente. O número deve subir no próximo sync.*

---

## 3. Arquitetura

O princípio é reusar: a tela `/painel/comunidades`, a rota de cobertura, o disparo e a
gaveta lógica sobre `campaign_groups` **já existem e ficam como estão**. A comunidade
nativa entra por dentro deles.

### 3.1 Schema — duas colunas

```sql
alter table public.groups
  add column if not exists community_jid  text,
  add column if not exists community_role text;
```

- `community_jid` — o JID da comunidade a que o grupo pertence. Para o próprio
  grupo-pai, o seu próprio id.
- `community_role` — `'parent'` | `'announce'` | `'member'` | `null`.

`campaign_groups.whatsapp_community_jid` **já existe** (migration
`20260915120000_community_jid.sql`) e nunca foi preenchida. Nada a criar lá.

Duas colunas em vez de `metadata jsonb` porque "quais grupos desta comunidade" e "qual
é o Avisos" entram em toda renderização de tela e em todo disparo — coluna indexável,
e o gate de drift de schema do CI a enxerga.

A migração vai nos **dois** bancos (dev `wfjuwogxaupyadwhvoxy`, prod
`nidoatbxaylrkcgbszns`) e o baseline é regravado, conforme a regra do projeto.

### 3.2 Sync passa a ler o que já recebe

`EvolutionGroup` ganha três campos opcionais. O mapeamento no upsert do sync:

| vem da Evolution | grava |
|---|---|
| `isCommunity: true` | `role='parent'`, `community_jid` = próprio id |
| `isCommunityAnnounce: true` | `role='announce'`, `community_jid` = `linkedParent` |
| só `linkedParent` | `role='member'`, `community_jid` = `linkedParent` |
| nenhum | `null`, `null` |

### 3.3 Reconciliação — a nativa entra na tela que já existe

Para cada comunidade nativa detectada no sync, garantir uma linha em `campaign_groups`
com `whatsapp_community_jid` preenchido, `name` = subject do grupo-pai e `group_ids` =
os grupos com `role='member'` daquele `community_jid`.

Assim a comunidade nativa aparece na tela existente, no disparo existente e na
cobertura existente. **Nenhuma tela nova.**

**Filtro obrigatório:** só reconciliar comunidades que tenham **pelo menos um grupo
onde o tenant é admin** (`groups.is_admin = true`). O número principal é membro de 14
comunidades, a maioria de terceiros (GLA, TINTIM, CPA CHINÊS…) — sem esse filtro a
tela vira lixo com comunidades alheias.

### 3.4 Tela

Gaveta com `whatsapp_community_jid` preenchido ganha:

- selo **"nativa do WhatsApp"**;
- vincular/desvincular **desabilitados**, com a nota *"gerencie no WhatsApp"*.
  Desvincular na Girumo não desvincula no WhatsApp — deixar o botão ativo seria
  mentir para o usuário sobre o efeito da ação;
- o grupo de Avisos identificado, a contagem de grupos vinculados e o **alcance lido
  do `members` do Avisos** (seção 2.6).

**Efeito colateral a corrigir na mesma mudança:** hoje o grupo-pai e o Avisos aparecem
em `/painel/grupos` como grupos comuns, porque o sync não os distingue. O pai tem 1
membro (disparar nele não faz nada) e o Avisos tem 1.984 (disparar nele alcança a
comunidade toda sem o usuário saber disso). Com `community_role` preenchido, os dois
saem da lista de grupos de envio e ganham tratamento próprio.

Design system: namespace `pn-*`, Aurora VIP, motion `ease-fluxo`.

### 3.5 Disparo pelo Avisos

Quando a gaveta é nativa e tem um grupo `role='announce'`, oferecer **"enviar 1× pelo
Avisos"** ao lado do envio normal, mostrando o alcance de cada opção antes da escolha.

O envio em si é uma mensagem para um grupo — capacidade que o Girumo já tem. Não há
rota nova na Evolution.

**A confirmar na implementação:** o disparo entregue na Fase 4 (PR #296) não passa por
`stores/communities.ts` — apenas três rotas o importam, nenhuma de mensagem. Rastrear
como o botão resolve os grupos hoje antes de encaixar o Avisos. Isso não muda o
desenho, mas pode mudar onde o código entra.

---

## 4. Ordem de execução

1. **Mutirão parcial (Igor, no celular).** Vincular ~10 grupos a uma das três
   comunidades existentes. Serve a três propósitos: dá dado real para desenvolver
   contra, testa o teto sem risco, e valida que o vínculo aparece no
   `fetchAllGroups`.
2. **Schema + sync + reconciliação**, com dado verdadeiro no banco.
3. **Tela + disparo.**
4. **Mutirão completo** (os 92), se o passo 1 confirmar que vale.

---

## 5. Fora de escopo

- **O fork da Evolution.** Cancelado (seção 2.4).
- **Criar, vincular ou desvincular comunidade pela Girumo.** É a operação de escrita
  em massa que carrega o risco de banimento.
- **Adicionar participantes à comunidade.** Herdado do spec anterior; é a operação que
  toma 403 na issue #2616 da Evolution.
- **`group_participants` vazio no tenant principal.** Descoberto de passagem: a Fase 3
  (PR #297 — alcance real e sugestão de cobertura) não tem dado no tenant de 92
  grupos, então a tela de cobertura provavelmente mostra zero. É bug separado, entra
  no quadro por conta própria.

---

## 6. Riscos

**R1 — o teto da comunidade.** As fontes públicas divergem (50 ou 100 grupos; 2.000 ou
5.000 membros) e 9.667 membros somados estoura qualquer versão. **Mitigação:** o
mutirão parcial mede o teto real de graça; o modelo suporta N comunidades porque
`campaign_groups` é N:N, e a Mega Stock já tem três.

**R2 — alcance do Avisos não é a soma dos grupos.** ~~Quem está em três grupos
vinculados é uma pessoa na comunidade, não três, e `group_participants` está vazio no
tenant principal.~~ **Resolvido pela seção 2.6:** o `members` do grupo de Avisos já é a
contagem da comunidade inteira, deduplicada pelo WhatsApp (1.984 na `#1`). A tela lê
esse campo e não soma nada. O risco que resta é só de frescor — o número vale do
último sync, como qualquer outro `members`.

**R3 — reconciliação ressuscitando gaveta apagada.** Se o usuário apagar a gaveta de
uma comunidade nativa, o próximo sync a recria. **Mitigação:** aceitar por ora — a
gaveta nativa é um espelho do WhatsApp, e apagá-la na Girumo não desfaz nada lá.
Revisar se incomodar de verdade.

---

## 7. Pendência de infra

A instância `prova-comunidade` + `prova-comunidade-db` no Coolify continua no ar
(verificada respondendo em 17/09/2026). Com o fork cancelado ela não tem mais uso.
Desligar é decisão do Igor e trabalho separado deste plano.

---

## 8. Verificação

Nenhuma fase fecha sem prova colhida na hora — mergeado não é verificado, rodando em
produção não é verificado.

- Depois do mutirão parcial: a tela mostra a comunidade nativa com os grupos reais
  vinculados, com o selo e os botões desabilitados.
- Um disparo real pelo Avisos chega nos grupos vinculados.

```sql
select public.move_card('<key>', '<status>', '<motivo>', '<PR #N ou arquivo>');
```
