# Gestão de Comunidade — design

**Data:** 2026-09-04
**Estado:** aprovado no brainstorming, pendente de execução
**Origem:** sessão de brainstorming com o Igor em 04/09/2026

---

## 1. O problema, em número

Medido em produção (`nidoatbxaylrkcgbszns`) em 04/09/2026:

| tenant | grupos | membros (assentos) | admin | com convite | com `linkedParent` |
|---|---|---|---|---|---|
| `igor@hubflow.com.br` | 91 | 9.737 | 91 | 91 | **0** |
| `Igor` | 36 | 7.506 | 36 | 10 | **0** |

E a distribuição em coleções:

| tenant | grupos | numa coleção | **órfãos** |
|---|---|---|---|
| `igor@hubflow.com.br` | 91 | 15 | **76** |
| `Igor` | 36 | 20 | **16** |

**83% dos grupos do tenant principal estão fora de qualquer estrutura.** Não porque
a estrutura não existe — existe, e está descrita na seção 3 — mas porque ela nasceu
dentro de "Campanhas", como destino de disparo, e nunca foi apresentada como a casa
dos grupos. Ninguém arruma a gaveta que não vê.

Nenhum grupo pertence a uma comunidade nativa do WhatsApp hoje (`linkedParent` = 0
nos dois tenants).

---

## 2. O achado que define a arquitetura

A cadeia é `Girumo → Evolution API → Baileys → WhatsApp`. Os três foram
verificados na fonte em 04/09/2026:

| camada | tem comunidade? | evidência |
|---|---|---|
| **Baileys** | sim, 20+ métodos | `src/Socket/communities.ts`, **14.698 bytes na tag `v7.0.0-rc.9`** |
| **Evolution API** | não | 12 routers; `community` aparece **0 vezes** no repo inteiro |
| Girumo | não | consome só o que a Evolution expõe |

Métodos do Baileys que resolvem o pedido:

```
communityCreate(subject, body)                    // cria a comunidade
communityLinkGroup(groupJid, parentCommunityJid)  // vincula grupo existente
communityUnlinkGroup(groupJid, parentCommunityJid)
communityFetchLinkedGroups(jid)
communityMetadata(jid) / communityInviteCode(jid) / communityParticipantsUpdate(...)
```

**O `package.json` da Evolution declara `"baileys": "7.0.0-rc.9"`** — a mesma tag em
que `communities.ts` existe. Ou seja: **a capacidade já está instalada no servidor
do Coolify.** Falta a porta de entrada HTTP.

Isto corrige uma conclusão anterior desta mesma sessão ("impossível criar
comunidade por código"), que se baseou em ler apenas `src/Socket/groups.ts` do
Baileys e o `group.router.ts` da Evolution. O arquivo certo é `communities.ts`, no
plural.

---

## 3. `campaign_groups` já é a comunidade

Schema real em produção:

| coluna | o que é de verdade |
|---|---|
| `name` | nome da comunidade — "BOTA FORA", "POSTAGENS GERAIS MEGA STOCK" |
| `slug` | identificador de URL |
| `group_ids[]` | os grupos que pertencem a ela |
| `auto_grow` | se cresce sozinha |
| `grow_template` | molde do próximo grupo da sequência |

E `group_grow_jobs.campaign_group_id` já cria o próximo grupo **por coleção**.
Quatro coleções existem hoje: BOTA FORA (13 grupos), POSTAGENS GERAIS MEGA STOCK
(20), Reativação setembro (2), Novidade agosto (2) — todas com `auto_grow = true`
e molde.

Atenção ao casar `group_ids` com `groups`: em produção o array guarda
**`whatsapp_group_id`**, não o UUID. O seed de dev guarda UUID e mente sobre isso.

**Decisão: reusar, não recriar.** A tabela ganha uma coluna para o JID da
comunidade nativa. Coleção com JID espelha uma comunidade real do WhatsApp;
coleção sem JID é gaveta só da Girumo. Uma tabela, duas naturezas.

Alternativas descartadas e por quê:

- **Tabela `communities` nova com `groups.community_id` FK (1:N).** Obrigaria migrar
  as 4 coleções, reescrever auto-grow + disparo + relâmpago, e proibiria um grupo
  de estar em duas comunidades. O modelo N:N atual é mais capaz, não menos.
- **Dois conceitos separados** (`campaign_groups` para campanha, `communities` para
  gaveta permanente). Dois conceitos parecidos na mesma tela — o histórico do
  projeto diz que isso confunde.

---

## 4. Identidade de participante: `@lid`, não telefone

Já medido e registrado (ver memória `whatsapp-regime-lid-medido`): o número de
produção está **100% em `@lid`**, zero `@s.whatsapp.net`. Cerca de **13–18% dos
participantes chegam sem `phoneNumber`**, e **não existe API que resolva
`@lid` para telefone sob demanda**.

Consequência para este design:

- A chave de identidade é `participant_lid` — cobertura de 100%.
- `phone` é enriquecimento oportunista (~82%) e **nullable**. Nunca inventar número.
- Dedupe de pessoas funciona para todo mundo, porque roda sobre `@lid`.

---

## 5. Arquitetura

### 5.1 Schema

Uma coluna nova em `campaign_groups`:

```sql
alter table public.campaign_groups
  add column if not exists whatsapp_community_jid text;
```

Uma tabela nova, para pessoas únicas:

```sql
create table if not exists public.group_participants (
  tenant_id          uuid        not null,
  whatsapp_group_id  text        not null,
  participant_lid    text        not null,
  phone              text,
  is_admin           boolean     not null default false,
  first_seen_at      timestamptz not null default now(),
  last_seen_at       timestamptz not null default now(),
  primary key (tenant_id, whatsapp_group_id, participant_lid)
);
```

Volume esperado: ~10 mil linhas por tenant (91 grupos x ~107 participantes).

Alimentada pelo sync que **já chama** `fetchAllGroups(getParticipants=true)` — zero
chamadas novas à Evolution. Hoje `isAdminGroup` recebe a lista inteira de
participantes de cada grupo, procura só o telefone do dono e descarta o resto
(`apps/web/src/lib/evolution/admin-group.ts`).

**Regras obrigatórias do projeto que se aplicam aqui:**

- Toda query em tabela com `tenant_id` precisa do filtro `tenant_id` explícito.
  O service-role bypassa RLS; esse filtro é a proteção real, não o RLS.
- RLS ligado + policy no padrão `auth.uid()` + `memberships` (defesa em
  profundidade), nunca no padrão GUC — 13 policies do banco já são deny-all por
  acidente por dependerem de `current_setting`.
- Função nova de `public` nasce executável por `authenticated` (default privilege
  do grantor). Revogar explicitamente e conceder só a `service_role`.
- A migração vai nos **dois** bancos (dev `wfjuwogxaupyadwhvoxy`, prod
  `nidoatbxaylrkcgbszns`). Aplicar só em um cria drift silencioso — as API routes
  são dual-mode e caem no fallback JSON sem erro.
- O gate de drift de schema no CI só hasheia `nome:tipo` de coluna — é cego a
  constraint e a corpo de função. Conferir por SQL nos dois bancos, não confiar
  no verde.

### 5.2 A peça que falta na Evolution

Fork da Evolution **congelado na 2.3.7** (ver risco R1), seguindo o molde de
`group.router.ts`:

| arquivo | papel |
|---|---|
| `src/api/dto/community.dto.ts` | DTOs de entrada |
| `src/validate/community.schema.ts` | schemas de validação |
| `src/api/controllers/community.controller.ts` | controller |
| `src/api/routes/community.router.ts` | rotas HTTP |
| `.../whatsapp/whatsapp.baileys.service.ts` | métodos que chamam o Baileys — enxertar ao lado de `createGroup` (linha ~4329) |
| `src/api/routes/index.router.ts` + `server.module.ts` | registro |

Rotas mínimas a expor:

```
POST   /community/create/:instance          -> communityCreate
POST   /community/linkGroup/:instance       -> communityLinkGroup
POST   /community/unlinkGroup/:instance     -> communityUnlinkGroup
GET    /community/linkedGroups/:instance    -> communityFetchLinkedGroups
GET    /community/metadata/:instance        -> communityMetadata
```

Deploy: build da imagem + colar o compose no Coolify. **O compose do Coolify é
colado à mão e não vem do git** — um PR de infra não muda a stack sozinho.

Toda rota nova que o worker chama precisa entrar na allowlist `ENGINE_ONLY`, ou o
worker leva 401 para sempre.

### 5.3 Telas

| rota | o que é | mudança |
|---|---|---|
| `/painel/comunidades` | **nova.** Cartões de comunidade: alcance real, nº de grupos, auto-grow, selo de nativa. Faixa "Sem comunidade (N)" no fim | criar |
| `/painel/comunidades/[slug]` | **nova.** Grupos da comunidade, sobreposição, sugestão de cobertura, vincular/desvincular | criar |
| `/painel/grupos` | **permanece intacta** — sync, ações em massa, revisar links, apelido, convite | +selo de comunidade, +filtro "sem comunidade" |
| `/painel/campanhas` | intacta | nenhuma |

Navegação (`apps/web/src/lib/painel-nav.ts`): `Comunidades` entra **acima** de
`Grupos`, na primeira seção. `Grupos` **não sai** — decisão explícita do Igor: a
tela de grupos tem funções próprias (ações em massa, 411 linhas) que não devem ser
remendadas para caber numa tela de comunidade.

Adicionar em `NAV_GROUPS`, `NAV_MOBILE_PRIMARY` (avaliar) e — por consequência —
`NAV_ALL`. Componente que não é referenciado por uma rota nunca chega na tela:
conferir com `git grep` em `apps/web/src/app` antes de dar por pronto.

Design system: namespace `pn-*`, Aurora VIP, motion `ease-fluxo`.

---

## 6. Fases

| # | entrega | depende de | risco |
|---|---|---|---|
| **0** | **Prova**: script descartável que cria comunidade de teste no número real, vincula 2 grupos, lista e desfaz | — | **alto — é o que valida tudo** |
| **1** | Peça na Evolution (fork 2.3.7 + rotas + deploy Coolify) | 0 passar | médio |
| **2** | Girumo: tela de comunidades, criar, arrastar grupo, desvincular; os 76 órfãos entram | 1 | médio |
| **3** | `group_participants` + alcance real + sobreposição + sugestão de cobertura | — (backend); 2 (tela) | baixo |
| **4** | Disparo para a comunidade — resolve os grupos **na hora do envio**, e permite usar o grupo de Avisos (1 envio no lugar de 91) | 2 | baixo |
| **5** | Link único distribuidor `/c/[slug]` para o grupo não-cheio da vez | 2 | baixo |

**A Fase 0 é inegociável.** Se `communityCreate` / `communityLinkGroup` devolverem
403 no número real, o plano degrada assim — não morre:

| fase | se a Fase 0 falhar |
|---|---|
| 1 (Evolution) | **cancelada.** Sem fork, sem dívida de infra. |
| 2 (tela) | **entregue sem os botões de criar/vincular.** A tela continua: gaveta lógica sobre `campaign_groups`, os 76 órfãos entram, e a comunidade nativa que o Igor criar no celular aparece por leitura de `linkedParent`. |
| 3, 4, 5 | **intactas.** Nenhuma depende de *criar* comunidade — só da tela da Fase 2 existir. |

Ou seja: a Fase 2 é a dependência real de 3/4/5, e ela é entregável nos dois
cenários. O que a Fase 0 decide é se ela nasce com ou sem os botões de escrita.

### Sugestão de cobertura (Fase 3)

Algoritmo guloso sobre `group_participants`: ordenar grupos pela quantidade de
pessoas **ainda não cobertas** que cada um adiciona, acumular até atingir o alvo de
cobertura (ex.: 95%). Com 91 grupos e ~10 mil pessoas roda instantâneo.

Saída para a tela: *"estes 45 grupos cobrem 95% das suas pessoas"*. É **leitura, não
ação** — decisão explícita do Igor: a plataforma nunca corta grupo sozinha. Quem
está só no grupo excluído ficaria sem a oferta, e essa escolha é do lojista.

Valor direto no anti-ban: metade dos envios para quase todo o alcance, contra caps
de 120/h e 800/dia.

---

## 7. Riscos

**R1 — Evolution 2.4.0 exige licença.**
[Issue #2534](https://github.com/evolution-foundation/evolution-api/issues/2534): a
partir da 2.4.0 é preciso ativar licença no `/manager`, o que quebra self-hosted
headless. O ambiente roda 2.3.7. **Mitigação:** o fork sai da 2.3.7 e congela.
Consequência aceita: updates da Evolution não entram sem reavaliar o licenciamento.

**R2 — o WhatsApp pode barrar operação de comunidade mesmo com o comando existindo.**
[Issue #2616](https://github.com/evolution-foundation/evolution-api/issues/2616):
conta com **Super Admin** na comunidade recebe `403 add_request`. É outra operação
(adicionar participante, não vincular grupo), mas é o mesmo território.
**Mitigação:** a Fase 0 existe exatamente para descobrir isso antes de qualquer
investimento.

**R3 — 9.737 membros não cabem numa comunidade.**
As fontes públicas divergem no teto (50 ou 100 grupos; 2.000 ou 5.000 membros) e
nenhuma é confiável o bastante para virar constante no código. Em qualquer versão,
9.737 estoura o teto de membros. **Mitigação:** a Fase 0 mede o teto real tentando;
a tela avisa antes de tentar; e o modelo já suporta N comunidades porque
`campaign_groups` é N:N.

**R4 — coleções efêmeras vão aparecer como comunidade.**
"Novidade agosto" e "Reativação setembro" são campanhas, não gavetas permanentes.
Elas aparecerão na tela nova. **Decisão: aceitar por ora.** Adicionar uma coluna
`kind` agora é adivinhar taxonomia com 4 linhas de amostra. Revisar quando a
poluição for real.

**R5 — manter o fork é dívida permanente.**
Apresentado ao Igor e aceito explicitamente ("quero fazer tudo pela Girumo").

---

## 8. Fora de escopo

- **Renomear a tabela `campaign_groups`.** Três consumidores em produção; o ganho é
  cosmético e o risco não.
- **Coluna `kind` para separar comunidade de campanha** (ver R4).
- **Resolver `@lid` para telefone.** Não existe API. `null` é a resposta honesta.
- **Cortar grupos automaticamente no disparo.** Decisão do Igor: sugerir, nunca agir.
- **Adicionar participantes à comunidade pela Girumo.** É a operação que toma 403 na
  issue #2616. Fora de escopo até haver evidência de que funciona.

---

## 9. Verificação

Nenhuma fase fecha sem prova colhida na hora — mergeado não é verificado, rodando
em produção não é verificado. O card do quadro só vai para `no_ar_verificado` com
evidência, e o banco recusa o movimento sem ela.

```sql
select public.move_card('<key>', '<status>', '<motivo>', '<PR #N ou arquivo>');
```
