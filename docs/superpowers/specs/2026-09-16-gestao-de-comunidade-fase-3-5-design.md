# Gestão de Comunidade — Fases 3 a 5 — design

**Data:** 2026-09-16
**Estado:** aprovado no brainstorming, pendente de execução
**Origem:** sessão de brainstorming com o Igor em 16/09/2026, continuando
`docs/superpowers/specs/2026-09-04-gestao-de-comunidade-design.md` (Fase 2 mergeada no PR #292)

---

## 1. Por que este spec existe

O spec original (04/09) desenhou as Fases 3, 4 e 5 a partir de um estado do
código que mudou depois que a Fase 2 foi implementada. Duas leituras diretas
do código, feitas nesta sessão, encolhem o escopo real de duas das três fases:

- **`/api/campanhas/[slug]/messages`** já resolve qualquer slug de
  `campaign_groups` — comunidade ou campanha, é a mesma tabela e a rota não
  distingue. O motor de disparo (fan-out via `enqueue_broadcast`) já funciona
  pra comunidade hoje; só falta UI.
- **`resolveClickTarget`** (`apps/web/src/lib/links/resolve-click-target.ts`),
  usado pelo link mestre `/r/[slug]` que toda comunidade já ganha na criação
  (Fase 2, via `criarLinkMestreOuDesfazer`), já rotaciona pro próximo grupo
  não-cheio do pool, com grupo lembrado por cookie e fallback de auto-grow —
  exatamente a descrição original da Fase 5.

Consequência: a Fase 4 vira reuso de UI, a Fase 5 vira um alias de rota. A
única fase com trabalho de verdade — schema novo, sync, algoritmo — é a 3.
Por isso a ordem de entrega inverte: **5 → 4 → 3**, menor e de menor risco
primeiro, com a fase grande recebendo mais tempo de maturação sem bloquear
as outras duas.

---

## 2. Fase 5 — `/c/[slug]`

Rota nova `apps/web/src/app/c/[slug]/route.ts`, espelhando
`apps/web/src/app/r/[slug]/route.ts`: mesmo `resolveClickTarget`, mesmo
cookie de grupo lembrado, mesmo tracking de clique. A única diferença é o
prefixo que o lojista compartilha — `/c/` lê "comunidade", `/r/` lê
"campanha" (herdado do modelo de campanha que a comunidade reusa).

**Decisão: handler duplicado, não redirect.** Um redirect 308 de `/c/` pra
`/r/` custaria 3 linhas, mas trocaria a URL na barra do navegador após o
clique (confunde quem clicou achando "comunidade" e vê "campanha") e faria o
clique contar como vindo de `/r/`, não de `/c/`. O handler duplicado chama a
mesma função pura já testada — o custo extra é um arquivo de rota, não lógica
nova.

Sem migração, sem mudança em `communities.ts` — o slug que
`criarLinkMestreOuDesfazer` já grava em `tracked_links` serve pros dois
prefixos.

**Teste:** reaproveita a suíte de `resolve-click-target.test.ts` (lógica pura
já coberta); o teste novo confirma só que a rota `/c/[slug]` existe e
devolve o redirect esperado — não reimplementa a suíte de rotação.

---

## 3. Fase 4 — disparo pela comunidade

`MessagesTab` (`apps/web/src/components/painel/messages/messages-tab.tsx`)
já recebe `{ campaignSlug, groupIds }` — nenhum conceito de campanha
propriamente dito, só um slug e uma lista de grupos.

Mudança em `apps/web/src/app/painel/comunidades/[slug]/page.tsx`: importar
`MessagesTab` e acrescentar uma seção "Mensagens" abaixo de "Grupos",
passando `campaignSlug={comunidade.slug}` e `groupIds={comunidade.groupIds}`.

`GET`/`POST /api/campanhas/[slug]/messages` **não muda** — já resolve
qualquer slug de `campaign_groups`.

**Fora de escopo (decisão explícita):** o "grupo de Avisos" (comunidade
NATIVA do WhatsApp, 1 envio em vez de N) do spec original depende de
`whatsapp_community_jid`, que nunca é preenchido — a Fase 0 terminou em 403 e
nada escreve essa coluna hoje. Derrubado por ora, sem desenhar rota de
código pra ele. Se a Fase 0 for reautorizada no futuro, "Avisos" volta como
otimização à parte, não como parte desta leva.

**Risco de produto aceito, não técnico:** a mesma coleção pode ser disparada
tanto por `/painel/campanhas/[slug]` quanto por `/painel/comunidades/[slug]`
— é o mesmo broadcast, a mesma linha, não duplica nada, mas pode confundir
sobre "de onde eu disparei da última vez". Efeito colateral honesto do
modelo N:N que o spec original já aceitou (R4).

**Teste:** nenhum — é passagem de prop, sem lógica nova. Verificação manual:
abrir uma comunidade, disparar, confirmar que chega nos grupos certos.

---

## 4. Fase 5 → 4 → 3: por que essa ordem

| ordem | fase | por quê primeiro/depois |
|---|---|---|
| 1 | 5 | Menor risco, menor diff, destrava a URL "certa" pro lojista compartilhar |
| 2 | 4 | Pequeno, destrava disparo pela tela certa, sem dependência de schema |
| 3 | 3 | Única com migração + algoritmo; mais tempo pra amadurecer sem bloquear as outras |

Cada fase é um PR próprio, fechado (revisado, CI verde, mergeado) antes de
abrir o próximo — não empilhar as três em paralelo (regra do projeto: uma
coisa por PR).

---

## 5. Fase 3 — `group_participants`, alcance real e sugestão de cobertura

### 5.1 Schema

Já aprovado no spec original (§5.1), sem mudança:

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

Volume esperado: ~10 mil linhas por tenant (91 grupos × ~107 participantes).

RLS ligado + policy no padrão `auth.uid()` + `memberships` (nunca GUC — ver
CLAUDE.md do projeto, seção de RLS). Migração vai nos dois bancos (dev
`wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`).

### 5.2 Ponto de alimentação — confirmado no código nesta sessão

`POST /api/groups/sync` (`apps/web/src/app/api/groups/sync/route.ts`) chama
`fetchAllGroups(remoteName)` — com participantes completos — no caminho
feliz. Só cai pra `fetchAllGroupsLight` (sem participantes) no fallback de
timeout (`isEvolutionTimeout`). **Zero chamada nova à Evolution**: o gancho
fica logo depois de `partitionByAdmin`, onde `remoteGroups` (com
`participants[]`) já está em memória pros grupos administrados.

Cada sync bem-sucedido faz upsert em `group_participants` por
`(tenant_id, whatsapp_group_id, participant_lid)`, atualizando `last_seen_at`
e `phone` (nullable — ~13-18% dos participantes chegam sem telefone, ver
`whatsapp-regime-lid-medido`). No fallback de timeout, os dados ficam parados
até o próximo sync completo — mesma degradação que a contagem de membros já
aceita hoje.

**Backfill:** nenhum script separado. O primeiro clique em "Sincronizar"
depois do deploy já popula os 92+36 grupos existentes (contagem real em prod
em 16/09/2026 — o spec original media 91+36 em 04/09; a diferença é
crescimento orgânico normal, não bug). A UI de cobertura precisa de um estado
vazio decente pra comunidade que ainda não teve nenhum sync desde o deploy.

### 5.3 Algoritmo de sugestão de cobertura

Função pura, testável sem banco (mesmo padrão de `orfaos.ts`): guloso —
ordena os grupos da comunidade por quantas pessoas NOVAS cada um adiciona
(contribuição marginal, não tamanho bruto do grupo), acumula até bater
**95% fixo** (decisão: sem UI de configuração — trivial de ajustar depois se
pedirem), para. Com ~91 grupos e ~10 mil pessoas por tenant roda instantâneo
em memória.

Saída: leitura, nunca ação — decisão já registrada no spec original: a
plataforma nunca corta grupo sozinha, quem está só no grupo excluído do corte
ficaria sem a oferta, e essa escolha é do lojista.

### 5.4 UI

Seção "Cobertura" em `/painel/comunidades/[slug]`, abaixo de "Grupos": lista
os grupos no corte sugerido pra 95%, com o alcance real (deduplicado por
`participant_lid`) substituindo a soma ingênua de `members` que a tela usa
hoje — que superconta gente presente em mais de um grupo da mesma comunidade
(bug real na tela atual, corrigido de graça por esta fase, não uma feature
separada).

### 5.5 Testes

- Algoritmo guloso: `cobertura.test.ts`, puro, sem banco (mesmo padrão de
  `orfaos.test.ts`).
- Store novo: teste de tenant vazio recusado antes de tocar o banco (mesmo
  padrão de `communities.test.ts`).
- Escrita em `group_participants` durante o sync: integração — cobre com o
  harness de integração do projeto se houver; senão, verificação manual
  (sincronizar, conferir alcance real na tela bate com o esperado).

---

## 6. Fora de escopo (herdado do spec original, reafirmado)

- Grupo de Avisos / comunidade nativa do WhatsApp (ver §3 — depende da
  Fase 0, cancelada).
- Resolver `@lid` para telefone — não existe API, `null` é honesto.
- Cortar grupos automaticamente no disparo — decisão do Igor: sugerir, nunca
  agir.
- Alvo de cobertura configurável por tenant — fixo em 95% por ora.

---

## 7. Verificação

Mesma disciplina do spec original: nenhuma fase fecha sem prova colhida na
hora. Mergeado não é verificado; rodando em produção não é verificado. O
card do quadro só vai para `no_ar_verificado` com evidência real, e o banco
recusa o movimento sem ela.
