# Gestão de Comunidade — Fases 0 a 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provar que o WhatsApp aceita criar comunidade e vincular grupos por código, abrir essa capacidade na Evolution API, e entregar a tela `/painel/comunidades` na Girumo onde os 76 grupos órfãos ganham casa.

**Architecture:** A capacidade já existe no Baileys 7.0.0-rc.9 (`src/Socket/communities.ts`), que a Evolution 2.3.7 já tem instalado — falta só a rota HTTP. O plano abre essa rota num fork congelado da 2.3.7, prova num número de teste antes de tocar produção, e liga a Girumo por cima reusando `campaign_groups`, que já é a comunidade (name, slug, group_ids[], auto_grow, grow_template).

**Tech Stack:** Next.js 15 (App Router) · Supabase (dois bancos) · Evolution API 2.3.7 self-hosted no Coolify · Baileys 7.0.0-rc.9 · TypeScript strict · Tailwind

**Spec:** `docs/superpowers/specs/2026-09-04-gestao-de-comunidade-design.md`

## Global Constraints

- **A migração vai nos DOIS bancos:** dev `wfjuwogxaupyadwhvoxy` e prod `nidoatbxaylrkcgbszns`. Aplicar só em um cria drift silencioso — as API routes são dual-mode e caem no fallback JSON sem erro.
- **Toda query em tabela com `tenant_id` leva o filtro `tenant_id` explícito.** O service-role bypassa RLS; esse filtro é a proteção real. 68 arquivos usam `getSupabaseAdmin()` contra 4 que usam anon.
- **Função nova de `public` nasce executável por `authenticated`** (default privilege do grantor). Revogar de `public, anon, authenticated` e conceder só a `service_role`.
- **RLS ligado + policy no padrão `auth.uid()` + `memberships`.** Nunca no padrão GUC (`current_setting('app.tenant_id')`) — 13 policies do banco já são deny-all por acidente assim.
- **`campaign_groups.group_ids` guarda `whatsapp_group_id` em produção, não UUID.** O seed de dev guarda UUID e mente sobre isso.
- **Antes de push:** rodar `verify-local.ps1` (é o gate real do CI: scan de secrets + build). `lint` e `tsx --test` **não** checam tipo — rodar os dois `tsc` também. `pwsh` não existe nesta máquina; é `powershell`.
- **PowerShell 5.1:** sem `&&` / `||`. Encadear com `;` ou `if ($?) { ... }`.
- **Em worktree usar `git -C <path>` e caminho absoluto sempre** — o cwd do Bash reseta entre chamadas.
- **Nunca `git add -A`** — conferir `git diff --cached` numa chamada separada antes de commitar; agentes externos sujam o índice.
- **Rota nova que o worker chama precisa entrar na allowlist `ENGINE_ONLY`**, ou o worker leva 401 para sempre.
- Design system do painel: namespace `pn-*`, Aurora VIP, motion `ease-fluxo`.

---

## File Structure

### Fase 0–1 — repositório da Evolution (fork, fora deste repo)

| arquivo | responsabilidade |
|---|---|
| `src/api/dto/community.dto.ts` | DTOs de entrada das rotas de comunidade |
| `src/validate/community.schema.ts` | JSON schemas de validação |
| `src/api/controllers/community.controller.ts` | orquestra: recebe DTO, chama o service da instância |
| `src/api/routes/community.router.ts` | rotas HTTP, seguindo o molde de `group.router.ts` |
| `.../channel/whatsapp/whatsapp.baileys.service.ts` | **modificar** — métodos que chamam o Baileys, ao lado de `createGroup` (~linha 4329) |
| `src/api/routes/index.router.ts` | **modificar** — registrar o router |
| `src/api/server.module.ts` | **modificar** — registrar o controller |

### Fase 2 — repositório da Girumo (este repo)

| arquivo | responsabilidade |
|---|---|
| `apps/web/supabase/migrations/<ts>_community_jid.sql` | coluna `whatsapp_community_jid` |
| `apps/web/src/lib/evolution/community.ts` | cliente HTTP das rotas novas da Evolution |
| `apps/web/src/lib/evolution/community.test.ts` | testes do cliente |
| `apps/web/src/lib/stores/communities.ts` | leitura/escrita de `campaign_groups` na ótica de comunidade |
| `apps/web/src/lib/communities/orfaos.ts` | cálculo puro: quais grupos não estão em nenhuma coleção |
| `apps/web/src/lib/communities/orfaos.test.ts` | testes do cálculo |
| `apps/web/src/app/api/comunidades/route.ts` | GET lista, POST cria |
| `apps/web/src/app/api/comunidades/[slug]/grupos/route.ts` | POST vincula, DELETE desvincula |
| `apps/web/src/app/painel/comunidades/page.tsx` | tela de lista |
| `apps/web/src/app/painel/comunidades/[slug]/page.tsx` | tela de detalhe |
| `apps/web/src/components/painel/comunidades/comunidade-card.tsx` | cartão de comunidade |
| `apps/web/src/components/painel/comunidades/orfaos-faixa.tsx` | faixa "Sem comunidade (N)" |
| `apps/web/src/lib/painel-nav.ts` | **modificar** — item `Comunidades` acima de `Grupos` |
| `apps/web/src/app/painel/grupos/page.tsx` | **modificar** — selo de comunidade + filtro "sem comunidade" |

---

# FASE 0 — Prova

> **Esta fase decide o resto do plano.** Se o WhatsApp devolver 403, as tarefas 1.x e 2.3–2.5 são canceladas e a Fase 2 é entregue sem os botões de escrita (ver spec §6).

> **ALERTA DE PRODUÇÃO:** nunca conectar um segundo Baileys ao número que já está pareado. Reescanear QR dispara `440 connectionReplaced` e derruba a sessão de produção. Toda a Fase 0 roda numa **instância nova da Evolution com um chip de teste**.

### Task 0.1: Fork mínimo da Evolution com duas rotas

**Files:**
- Create: `src/api/dto/community.dto.ts`
- Create: `src/api/routes/community.router.ts`
- Create: `src/api/controllers/community.controller.ts`
- Modify: `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts` (ao lado de `createGroup`, ~4329)
- Modify: `src/api/routes/index.router.ts`
- Modify: `src/api/server.module.ts`

**Interfaces:**
- Consumes: `communityCreate(subject, body)` e `communityLinkGroup(groupJid, parentJid)` do Baileys, disponíveis em `this.client`
- Produces: `POST /community/create/:instance` e `POST /community/linkGroup/:instance`

- [ ] **Step 1: Clonar a Evolution na tag exata de produção**

```bash
git clone https://github.com/evolution-foundation/evolution-api.git ~/Desktop/evolution-fork
cd ~/Desktop/evolution-fork
git checkout -b girumo/community v2.3.7
grep '"baileys"' package.json
```

Esperado: `"baileys": "7.0.0-rc.9"`. Se divergir, **pare** — a premissa do plano é que essa versão tem `communities.ts`. Confirmar com:

```bash
gh api repos/WhiskeySockets/Baileys/contents/src/Socket/communities.ts?ref=<versao> --jq .name
```

- [ ] **Step 2: Criar o DTO**

```typescript
// src/api/dto/community.dto.ts
export class CreateCommunityDto {
  subject: string;
  description?: string;
}

export class LinkGroupDto {
  communityJid: string;
  groupJid: string;
}
```

- [ ] **Step 3: Adicionar os métodos no service do Baileys**

Abrir `whatsapp.baileys.service.ts`, localizar `public async createGroup(` e inserir logo **antes** dele:

```typescript
  public async createCommunity(create: CreateCommunityDto) {
    try {
      const community = await this.client.communityCreate(
        create.subject,
        create.description ?? '',
      );
      return { communityJid: community.id, subject: community.subject };
    } catch (error) {
      throw new InternalServerErrorException('Error creating community', error.toString());
    }
  }

  public async linkGroupToCommunity(data: LinkGroupDto) {
    try {
      await this.client.communityLinkGroup(data.groupJid, data.communityJid);
      return { linked: true, groupJid: data.groupJid, communityJid: data.communityJid };
    } catch (error) {
      throw new InternalServerErrorException('Error linking group', error.toString());
    }
  }
```

Adicionar `CreateCommunityDto, LinkGroupDto` ao bloco de imports de DTO no topo do arquivo.

- [ ] **Step 4: Criar o controller**

```typescript
// src/api/controllers/community.controller.ts
import { CreateCommunityDto, LinkGroupDto } from '@api/dto/community.dto';
import { InstanceDto } from '@api/dto/instance.dto';
import { WAMonitoringService } from '@api/services/monitor.service';

export class CommunityController {
  constructor(private readonly waMonitor: WAMonitoringService) {}

  public async createCommunity(instance: InstanceDto, data: CreateCommunityDto) {
    return await this.waMonitor.waInstances[instance.instanceName].createCommunity(data);
  }

  public async linkGroup(instance: InstanceDto, data: LinkGroupDto) {
    return await this.waMonitor.waInstances[instance.instanceName].linkGroupToCommunity(data);
  }
}
```

- [ ] **Step 5: Criar o router**

```typescript
// src/api/routes/community.router.ts
import { RouterBroker } from '@api/abstract/abstract.router';
import { CreateCommunityDto, LinkGroupDto } from '@api/dto/community.dto';
import { communityController } from '@api/server.module';
import { RequestHandler, Router } from 'express';

import { HttpStatus } from './index.router';

export class CommunityRouter extends RouterBroker {
  constructor(...guards: RequestHandler[]) {
    super();
    this.router
      .post(this.routerPath('create'), ...guards, async (req, res) => {
        const response = await this.dataValidate<CreateCommunityDto>({
          request: req,
          schema: null,
          ClassRef: CreateCommunityDto,
          execute: (instance, data) => communityController.createCommunity(instance, data),
        });
        res.status(HttpStatus.CREATED).json(response);
      })
      .post(this.routerPath('linkGroup'), ...guards, async (req, res) => {
        const response = await this.dataValidate<LinkGroupDto>({
          request: req,
          schema: null,
          ClassRef: LinkGroupDto,
          execute: (instance, data) => communityController.linkGroup(instance, data),
        });
        res.status(HttpStatus.OK).json(response);
      });
  }

  public readonly router: Router = Router();
}
```

`schema: null` é deliberado nesta fase — a validação entra na Task 1.1, depois que a prova passar. Não vale escrever schema para uma rota que pode ser descartada.

- [ ] **Step 6: Registrar controller e router**

Em `src/api/server.module.ts`, ao lado de `groupController`:

```typescript
export const communityController = new CommunityController(waMonitor);
```

Em `src/api/routes/index.router.ts`, ao lado da linha do group:

```typescript
router.use('/community', new CommunityRouter(...guards).router);
```

- [ ] **Step 7: Build local — verificar que compila**

```bash
npm ci
npm run build
```

Esperado: build sem erro. Erro de tipo em `this.client.communityCreate` significa que a versão do Baileys não tem o método — **pare e reavalie**.

- [ ] **Step 8: Commit**

```bash
git add src/api/dto/community.dto.ts src/api/controllers/community.controller.ts src/api/routes/community.router.ts src/api/routes/index.router.ts src/api/server.module.ts src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts
git commit -m "feat(community): expose communityCreate and communityLinkGroup"
```

---

### Task 0.2: Provar no número de teste

**Files:** nenhum arquivo de código — esta task é operação e termina num relatório.

**Interfaces:**
- Consumes: as rotas da Task 0.1
- Produces: **a decisão** de seguir ou abortar as fases 1 e 2 de escrita, e o teto real de grupos por comunidade

- [ ] **Step 1: Subir a imagem do fork num serviço SEPARADO do Coolify**

Não substituir a Evolution de produção. Criar um serviço novo, com banco próprio, apontando para a imagem buildada do fork.

O compose do Coolify é **colado à mão** e não vem do git — editar pela UI.

- [ ] **Step 2: Criar instância e parear o chip de TESTE**

```bash
curl -X POST "$EVO_TEST_URL/instance/create" \
  -H "apikey: $EVO_TEST_KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"prova-comunidade","integration":"WHATSAPP-BAILEYS"}'
```

Escanear o QR com **o chip de teste**, nunca com o número de produção.

- [ ] **Step 3: Criar 2 grupos descartáveis pelo próprio WhatsApp do chip**

Anotar os dois JIDs (`...@g.us`).

- [ ] **Step 4: Tentar criar a comunidade**

```bash
curl -X POST "$EVO_TEST_URL/community/create/prova-comunidade" \
  -H "apikey: $EVO_TEST_KEY" -H "Content-Type: application/json" \
  -d '{"subject":"Prova Girumo","description":"descartavel"}'
```

Registrar a resposta **crua** — status HTTP e corpo inteiro.

- [ ] **Step 5: Tentar vincular os 2 grupos**

```bash
curl -X POST "$EVO_TEST_URL/community/linkGroup/prova-comunidade" \
  -H "apikey: $EVO_TEST_KEY" -H "Content-Type: application/json" \
  -d '{"communityJid":"<jid_da_comunidade>","groupJid":"<jid_do_grupo_1>"}'
```

Repetir para o grupo 2.

- [ ] **Step 6: Confirmar pelo caminho independente**

```bash
curl "$EVO_TEST_URL/group/fetchAllGroups/prova-comunidade?getParticipants=false" \
  -H "apikey: $EVO_TEST_KEY"
```

**Critério de sucesso:** os 2 grupos aparecem com `linkedParent` preenchido com o JID da comunidade. Conferir também no app do WhatsApp do chip, visualmente.

Isto responde a pergunta que nenhuma documentação responde: **se a Evolution repassa `linkedParent` no payload**. A Fase 2 sem escrita depende disso.

- [ ] **Step 7: Medir o teto real**

Vincular grupos até a API recusar, ou até 12 grupos — o que vier primeiro. Anotar o número e a mensagem de erro. É o único dado confiável sobre o limite; as fontes públicas divergem entre 50 e 100 grupos, 2.000 e 5.000 membros.

- [ ] **Step 8: Escrever o relatório e decidir**

Criar `docs/superpowers/plans/_prova-comunidade-resultado.md` com: status HTTP de cada chamada, corpo das respostas, se `linkedParent` apareceu, e o teto medido.

| resultado | consequência |
|---|---|
| create e link deram 2xx, `linkedParent` apareceu | seguir para a Fase 1 completa |
| 403 em qualquer um | **cancelar tarefas 1.x e 2.3–2.5**; entregar a Fase 2 só-leitura; registrar o corpo do 403 no relatório |
| `linkedParent` não aparece no `fetchAllGroups` | a Fase 2 precisa chamar `/community/linkedGroups` para saber a hierarquia — ajustar a Task 2.2 |

- [ ] **Step 9: Limpar**

Apagar os grupos e a comunidade de teste, e derrubar a instância `prova-comunidade`. Manter o serviço do Coolify se a Fase 1 for seguir.

---

# FASE 1 — Endurecer a peça na Evolution

> Só executar se a Task 0.2 concluiu com sucesso.

### Task 1.1: Validação de entrada e as três rotas restantes

**Files:**
- Create: `src/validate/community.schema.ts`
- Modify: `src/api/dto/community.dto.ts`
- Modify: `src/api/routes/community.router.ts`
- Modify: `src/api/controllers/community.controller.ts`
- Modify: `.../whatsapp.baileys.service.ts`

**Interfaces:**
- Consumes: as rotas da Task 0.1
- Produces: `POST /community/unlinkGroup/:instance`, `GET /community/linkedGroups/:instance`, `GET /community/metadata/:instance`, todas com schema

- [ ] **Step 1: Escrever os schemas**

```typescript
// src/validate/community.schema.ts
import { JSONSchema7 } from 'json-schema';

import { isNotEmpty } from './validate.schema';

export const createCommunitySchema: JSONSchema7 = {
  type: 'object',
  properties: {
    subject: { type: 'string', minLength: 1 },
    description: { type: 'string' },
  },
  required: ['subject'],
  ...isNotEmpty('subject'),
};

export const linkGroupSchema: JSONSchema7 = {
  type: 'object',
  properties: {
    communityJid: { type: 'string', pattern: '^\\d+@g\\.us$' },
    groupJid: { type: 'string', pattern: '^\\d+@g\\.us$' },
  },
  required: ['communityJid', 'groupJid'],
  ...isNotEmpty('communityJid', 'groupJid'),
};
```

O `pattern` de JID é a validação de fronteira que impede um JID malformado chegar ao Baileys. Conferir a assinatura real de `isNotEmpty` em `src/validate/validate.schema.ts` antes de usar.

- [ ] **Step 2: Trocar os `schema: null` do router**

Substituir por `createCommunitySchema` e `linkGroupSchema` nas duas rotas existentes.

- [ ] **Step 3: Adicionar os três métodos no service**

```typescript
  public async unlinkGroupFromCommunity(data: LinkGroupDto) {
    try {
      await this.client.communityUnlinkGroup(data.groupJid, data.communityJid);
      return { unlinked: true, groupJid: data.groupJid };
    } catch (error) {
      throw new InternalServerErrorException('Error unlinking group', error.toString());
    }
  }

  public async fetchLinkedGroups(communityJid: string) {
    try {
      return await this.client.communityFetchLinkedGroups(communityJid);
    } catch (error) {
      throw new InternalServerErrorException('Error fetching linked groups', error.toString());
    }
  }

  public async communityMetadata(communityJid: string) {
    try {
      return await this.client.communityMetadata(communityJid);
    } catch (error) {
      throw new InternalServerErrorException('Error fetching community metadata', error.toString());
    }
  }
```

- [ ] **Step 4: Expor as três no controller e no router**

Seguir exatamente o padrão das duas primeiras. `unlinkGroup` é POST com `linkGroupSchema`; `linkedGroups` e `metadata` são GET com `communityJid` na query.

- [ ] **Step 5: Build e commit**

```bash
npm run build
git add src/validate/community.schema.ts src/api/dto/community.dto.ts src/api/routes/community.router.ts src/api/controllers/community.controller.ts src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts
git commit -m "feat(community): unlink, linkedGroups, metadata + input validation"
```

- [ ] **Step 6: Repetir a prova da Task 0.2 nas rotas novas**

Vincular, listar, desvincular, listar de novo. A lista precisa refletir cada mudança.

---

### Task 1.2: Publicar em produção

**Files:** nenhum — operação de infra.

- [ ] **Step 1: Buildar e publicar a imagem com tag imutável**

```bash
docker build -t <registry>/evolution-girumo:2.3.7-community-1 .
docker push <registry>/evolution-girumo:2.3.7-community-1
```

Tag versionada, nunca `latest` — o rollback depende de saber para onde voltar.

- [ ] **Step 2: Anotar a imagem atual antes de trocar**

Registrar a tag que está rodando hoje. É o alvo do rollback.

- [ ] **Step 3: Trocar a imagem no Coolify e subir**

Editar pela UI (o compose é colado à mão). Redeploy.

- [ ] **Step 4: Verificar que a instância de produção continua conectada**

```bash
curl "$EVO_URL/instance/connectionState/<instancia_prod>" -H "apikey: $EVO_KEY"
```

Esperado: `open`. **Se cair, rollback imediato para a tag anotada no Step 2.**

- [ ] **Step 5: Verificar que as rotas antigas continuam respondendo**

```bash
curl "$EVO_URL/group/fetchAllGroups/<instancia_prod>?getParticipants=false" -H "apikey: $EVO_KEY"
```

- [ ] **Step 6: Documentar o fork**

Criar `deploy/coolify/README.evolution-community.md` no repo da Girumo com: a URL do fork, a tag base (v2.3.7), por que está congelado (licença obrigatória a partir da 2.4.0 — issue #2534), e o procedimento de rebuild.

---

# FASE 2 — Girumo

### Task 2.1: Migração da coluna e cálculo de órfãos

**Files:**
- Create: `apps/web/supabase/migrations/<timestamp>_community_jid.sql`
- Create: `apps/web/src/lib/communities/orfaos.ts`
- Test: `apps/web/src/lib/communities/orfaos.test.ts`

**Interfaces:**
- Produces: `gruposOrfaos(grupos, colecoes): T[]` e a coluna `campaign_groups.whatsapp_community_jid`

- [ ] **Step 1: Conferir por SQL que a coluna não existe nos dois bancos**

```sql
select table_schema, column_name from information_schema.columns
where table_name = 'campaign_groups' and column_name = 'whatsapp_community_jid';
```

Rodar nos dois. O gate de drift do CI é cego a constraint e a corpo de função — não confiar no verde.

- [ ] **Step 2: Escrever a migração**

```sql
alter table public.campaign_groups
  add column if not exists whatsapp_community_jid text;

comment on column public.campaign_groups.whatsapp_community_jid is
  'JID da comunidade nativa do WhatsApp que esta colecao espelha. NULL = gaveta apenas da Girumo.';
```

Sem função nova, sem policy nova: `campaign_groups` já tem RLS e policies.

- [ ] **Step 3: Escrever o teste do cálculo de órfãos**

```typescript
// apps/web/src/lib/communities/orfaos.test.ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { gruposOrfaos } from "./orfaos";

test("grupo fora de toda colecao e orfao", () => {
  const grupos = [{ whatsappGroupId: "1@g.us" }, { whatsappGroupId: "2@g.us" }];
  const colecoes = [{ groupIds: ["1@g.us"] }];
  assert.deepEqual(gruposOrfaos(grupos, colecoes).map((g) => g.whatsappGroupId), ["2@g.us"]);
});

test("grupo em duas colecoes nao e orfao e nao duplica", () => {
  const grupos = [{ whatsappGroupId: "1@g.us" }];
  const colecoes = [{ groupIds: ["1@g.us"] }, { groupIds: ["1@g.us"] }];
  assert.deepEqual(gruposOrfaos(grupos, colecoes), []);
});

test("sem colecao nenhuma, todo grupo e orfao", () => {
  const grupos = [{ whatsappGroupId: "1@g.us" }];
  assert.equal(gruposOrfaos(grupos, []).length, 1);
});

test("groupIds nulo nao quebra", () => {
  const grupos = [{ whatsappGroupId: "1@g.us" }];
  const colecoes = [{ groupIds: null }];
  assert.equal(gruposOrfaos(grupos, colecoes).length, 1);
});
```

- [ ] **Step 4: Rodar e ver falhar**

```bash
cd apps/web ; npx tsx --test src/lib/communities/orfaos.test.ts
```

Esperado: FAIL — módulo não encontrado.

- [ ] **Step 5: Implementar**

```typescript
// apps/web/src/lib/communities/orfaos.ts

/** Grupo na ótica de pertencimento — só o que o cálculo precisa. */
export type GrupoRef = { whatsappGroupId: string };

/** Coleção na ótica de pertencimento. `groupIds` guarda whatsapp_group_id em produção. */
export type ColecaoRef = { groupIds: string[] | null };

/**
 * Grupos que não estão em nenhuma coleção.
 *
 * Em produção `campaign_groups.group_ids` guarda `whatsapp_group_id`, não UUID —
 * o seed de dev guarda UUID e mente sobre isso. Casar pelo mesmo campo dos dois
 * lados é o que impede o cálculo de dizer "91 órfãos" em produção.
 */
export function gruposOrfaos<T extends GrupoRef>(grupos: T[], colecoes: ColecaoRef[]): T[] {
  const atribuidos = new Set<string>();
  for (const colecao of colecoes) {
    for (const id of colecao.groupIds ?? []) atribuidos.add(id);
  }
  return grupos.filter((g) => !atribuidos.has(g.whatsappGroupId));
}
```

- [ ] **Step 6: Rodar e ver passar**

```bash
cd apps/web ; npx tsx --test src/lib/communities/orfaos.test.ts
```

Esperado: 4 testes passando.

- [ ] **Step 7: Aplicar a migração nos DOIS bancos e conferir**

Aplicar em dev e prod, depois repetir o SELECT do Step 1 nos dois. Esperado: a coluna aparece nos dois.

- [ ] **Step 8: Commit**

```bash
git add apps/web/supabase/migrations apps/web/src/lib/communities
git commit -m "feat(comunidades): coluna de jid nativo e calculo de grupos orfaos"
```

---

### Task 2.2: Store de comunidades

**Files:**
- Create: `apps/web/src/lib/stores/communities.ts`
- Test: `apps/web/src/lib/stores/communities.test.ts`

**Interfaces:**
- Consumes: `gruposOrfaos` da Task 2.1
- Produces:

```typescript
export type Comunidade = {
  id: string;
  nome: string;
  slug: string;
  groupIds: string[];
  autoGrow: boolean;
  whatsappCommunityJid: string | null;
};

export function montarQueryComunidades(tenantId: string): { tenantId: string };
export async function listarComunidades(tenantId: string): Promise<Comunidade[]>;
export async function criarComunidade(tenantId: string, dados: { nome: string }): Promise<Comunidade>;
export async function vincularGrupo(tenantId: string, slug: string, whatsappGroupId: string): Promise<void>;
export async function desvincularGrupo(tenantId: string, slug: string, whatsappGroupId: string): Promise<void>;
```

- [ ] **Step 1: Ler o store existente como molde**

Ler `apps/web/src/lib/stores/campaign-groups.ts` inteiro. O store novo é uma **ótica diferente sobre a mesma tabela**, não uma reimplementação — reusar os helpers de conexão e o formato de erro que já existirem lá.

- [ ] **Step 2: Escrever o teste do filtro de tenant**

```typescript
// apps/web/src/lib/stores/communities.test.ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { montarQueryComunidades } from "./communities";

test("toda leitura filtra por tenant_id", () => {
  const q = montarQueryComunidades("tenant-abc");
  assert.equal(q.tenantId, "tenant-abc");
});

test("tenant vazio e recusado antes de tocar o banco", () => {
  assert.throws(() => montarQueryComunidades(""), /tenant/i);
});
```

O segundo teste é o que importa: o service-role bypassa RLS, então esquecer o filtro é vazamento cross-tenant imediato. O teste trava isso.

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/web ; npx tsx --test src/lib/stores/communities.test.ts
```

- [ ] **Step 4: Implementar o store**

Toda query leva `.eq("tenant_id", tenantId)`. `montarQueryComunidades` valida e devolve `{ tenantId }`, lançando se vazio. As quatro funções operam em `campaign_groups`:

- `listarComunidades` — `select` com o filtro de tenant, mapeando `whatsapp_community_jid` para `whatsappCommunityJid`
- `criarComunidade` — `insert` com slug derivado do nome. **Nesta task grava só no banco**, com `whatsapp_community_jid` nulo
- `vincularGrupo` / `desvincularGrupo` — leem `group_ids`, aplicam a mudança sobre um **array novo** (nunca mutar o original) e escrevem de volta

**A Evolution não é chamada aqui.** O cliente HTTP nasce na Task 2.3 e o laço se fecha na Task 2.3 Step 7 — esta task entrega um store completo e testável sozinho, que já resolve a gaveta lógica e os 76 órfãos mesmo que a Fase 0 tenha terminado em 403.

- [ ] **Step 5: Rodar e ver passar**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/stores/communities.ts apps/web/src/lib/stores/communities.test.ts
git commit -m "feat(comunidades): store sobre campaign_groups com filtro de tenant"
```

---

### Task 2.3: Cliente HTTP da Evolution

> **Cancelar esta task se a Task 0.2 terminou em 403.** Nesse caso, `criarComunidade` da Task 2.2 grava só no banco e a tela não oferece criação no WhatsApp.

**Files:**
- Create: `apps/web/src/lib/evolution/community.ts`
- Test: `apps/web/src/lib/evolution/community.test.ts`

**Interfaces:**
- Produces:

```typescript
export function parseCreateCommunityResponse(data: unknown): { communityJid: string };
export async function createCommunity(instanceName: string, subject: string, description?: string): Promise<{ communityJid: string }>;
export async function linkGroup(instanceName: string, communityJid: string, groupJid: string): Promise<void>;
export async function unlinkGroup(instanceName: string, communityJid: string, groupJid: string): Promise<void>;
export async function fetchLinkedGroups(instanceName: string, communityJid: string): Promise<string[]>;
```

- [ ] **Step 1: Ler `apps/web/src/lib/evolution/client.ts`**

Reusar o helper `request` e o tipo `EvolutionError` que já existem. Não criar um segundo caminho de HTTP.

- [ ] **Step 2: Escrever o teste do contrato de erro**

```typescript
// apps/web/src/lib/evolution/community.test.ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseCreateCommunityResponse } from "./community";

test("extrai o jid da resposta de criacao", () => {
  assert.equal(
    parseCreateCommunityResponse({ communityJid: "123@g.us" }).communityJid,
    "123@g.us",
  );
});

test("resposta sem jid e erro, nao null silencioso", () => {
  assert.throws(() => parseCreateCommunityResponse({}), /jid/i);
});

test("corpo nao-objeto e erro", () => {
  assert.throws(() => parseCreateCommunityResponse(null), /jid/i);
});
```

Um 200 sem JID utilizável precisa falhar alto: gravar `null` no banco criaria uma comunidade fantasma que a tela mostra e o WhatsApp não tem.

- [ ] **Step 3: Rodar e ver falhar**

```bash
cd apps/web ; npx tsx --test src/lib/evolution/community.test.ts
```

- [ ] **Step 4: Implementar**

Cada função chama a rota correspondente pelo `request` existente. `parseCreateCommunityResponse` valida que `communityJid` é string não-vazia e lança caso contrário.

- [ ] **Step 5: Rodar e ver passar**

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/evolution/community.ts apps/web/src/lib/evolution/community.test.ts
git commit -m "feat(comunidades): cliente das rotas de comunidade da evolution"
```

- [ ] **Step 7: Fechar o laço com o store da Task 2.2**

Voltar em `apps/web/src/lib/stores/communities.ts` e ligar as três funções ao cliente:

- `criarComunidade` — depois do `insert`, chamar `createCommunity(instanceName, nome)` e gravar o `communityJid` retornado na coluna `whatsapp_community_jid`. Se a chamada falhar, a comunidade **permanece no banco sem JID** (gaveta lógica válida) e o erro sobe para a tela — não desfazer o insert.
- `vincularGrupo` / `desvincularGrupo` — quando `whatsappCommunityJid` não for nulo, chamar `linkGroup` / `unlinkGroup` **antes** de gravar o array no banco. Se o WhatsApp recusar, propagar o erro e **não gravar**: o banco nunca deve afirmar um vínculo que o WhatsApp não tem.

A ordem importa. Gravar primeiro e chamar depois deixaria a tela mostrando um grupo "na comunidade" que o WhatsApp recusou — exatamente o tipo de mentira que o `linkedParent` da Task 0.2 Step 6 serve para desmentir.

- [ ] **Step 8: Rodar os testes do store e do cliente juntos**

```bash
cd apps/web ; npx tsx --test src/lib/stores/communities.test.ts src/lib/evolution/community.test.ts
```

Esperado: todos passando. Os testes da Task 2.2 não podem quebrar — se quebrarem, a integração vazou para o caminho que não usa Evolution.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/stores/communities.ts
git commit -m "feat(comunidades): store cria e vincula no whatsapp antes de gravar"
```

---

### Task 2.4: Rotas de API

**Files:**
- Create: `apps/web/src/app/api/comunidades/route.ts`
- Create: `apps/web/src/app/api/comunidades/[slug]/grupos/route.ts`

**Interfaces:**
- Consumes: store da Task 2.2, cliente da Task 2.3
- Produces: `GET /api/comunidades` → `{ comunidades: Comunidade[], orfaos: GrupoRef[] }`; `POST /api/comunidades` → `Comunidade`; `POST` e `DELETE /api/comunidades/[slug]/grupos`

- [ ] **Step 1: Ler uma rota existente como molde**

Ler `apps/web/src/app/api/campanhas/[slug]/grupos/route.ts`. Copiar dela: como o tenant é resolvido, o formato de erro, e o gate de plano.

**Atenção ao helper de tenant:** `resolveSessionTenantId` é só-cookie, e o painel manda Bearer. Usar o mesmo helper que a rota-molde usa, não escolher por conta própria.

- [ ] **Step 2: Escrever GET e POST de `/api/comunidades`**

GET devolve `{ comunidades, orfaos }` — a tela precisa dos dois na primeira carga.
POST recebe `{ nome }`, valida no servidor (não-vazio, no máximo 60 caracteres) e chama `criarComunidade`.

Validação server-side é obrigatória: nunca confiar só no cliente.

- [ ] **Step 3: Escrever POST e DELETE de `/api/comunidades/[slug]/grupos`**

Recebem `{ whatsappGroupId }`. Validar que o grupo pertence ao tenant **antes** de vincular — sem isso, um id forjado no corpo vincula grupo de outro tenant.

- [ ] **Step 4: Testar as quatro rotas com o servidor local**

```bash
cd apps/web ; npm run dev
```

Em outro terminal, exercitar cada rota. Conferir: sem sessão → 401; grupo de outro tenant → recusado; nome vazio → 400.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/comunidades
git commit -m "feat(comunidades): rotas de listagem, criacao e vinculo"
```

---

### Task 2.5: Telas e navegação

**Files:**
- Create: `apps/web/src/app/painel/comunidades/page.tsx`
- Create: `apps/web/src/app/painel/comunidades/[slug]/page.tsx`
- Create: `apps/web/src/components/painel/comunidades/comunidade-card.tsx`
- Create: `apps/web/src/components/painel/comunidades/orfaos-faixa.tsx`
- Modify: `apps/web/src/lib/painel-nav.ts`
- Modify: `apps/web/src/app/painel/grupos/page.tsx`

**Interfaces:**
- Consumes: `GET /api/comunidades` da Task 2.4

- [ ] **Step 1: Adicionar o item na navegação**

Em `painel-nav.ts`, dentro de `NAV_GROUPS[0].items`, **acima** de Grupos:

```typescript
{ href: "/painel/comunidades", label: "Comunidades", icon: Boxes },
```

Importar `Boxes` de `lucide-react`. Não usar `Layers` (é Campanhas) nem `Users` (é Grupos).

`NAV_ALL` deriva de `NAV_GROUPS` — nada a fazer lá. **`Grupos` permanece**: decisão explícita do Igor.

- [ ] **Step 2: Escrever o cartão de comunidade**

Mostra: nome, quantidade de grupos, soma de membros, selo "no WhatsApp" quando `whatsappCommunityJid` não é nulo, e indicador de auto-grow. Segue o design system do painel (`pn-*`, `ease-fluxo`).

- [ ] **Step 3: Escrever a faixa de órfãos**

Título "Sem comunidade (N)", lista os grupos e um botão por grupo para escolher a comunidade destino. É a peça que resolve o problema real: 76 grupos invisíveis.

Se `N` for 0, não renderizar a faixa.

- [ ] **Step 4: Escrever a tela de lista**

Busca `/api/comunidades`, renderiza os cartões e a faixa. Estado vazio (nenhuma comunidade) precisa de um caminho de ação, não uma tela morta.

- [ ] **Step 5: Escrever a tela de detalhe**

Grupos da comunidade, botão de desvincular por grupo, e — se `whatsappCommunityJid` for nulo e a Task 0.2 tiver passado — um botão "Criar no WhatsApp".

**Aviso obrigatório na tela:** os 9.737 membros do tenant não cabem numa comunidade só. Mostrar a soma de membros da comunidade e o teto medido na Task 0.2 Step 7, avisando **antes** de o usuário tentar vincular além do limite.

- [ ] **Step 6: Adicionar selo e filtro na tela de grupos**

Em `apps/web/src/app/painel/grupos/page.tsx`, acrescentar ao array `FILTERS`:

```typescript
{ value: "sem_comunidade", label: "Sem comunidade" },
```

E uma coluna com o nome da comunidade do grupo (ou traço). Não remover nada do que já existe.

- [ ] **Step 7: Verificar que as telas chegam de verdade**

```bash
git grep -n "painel/comunidades" -- apps/web/src/app apps/web/src/lib
```

Componente que nenhuma rota referencia nunca chega na tela. Depois subir `npm run dev` e navegar de fato: `/painel` → clicar em Comunidades → abrir uma → voltar.

- [ ] **Step 8: Rodar o gate completo antes do push**

```powershell
.\verify-local.ps1
```

E os dois `tsc` — `lint` e `tsx --test` não checam tipo.

- [ ] **Step 9: Commit e PR**

```bash
git add apps/web/src/app/painel/comunidades apps/web/src/components/painel/comunidades apps/web/src/lib/painel-nav.ts apps/web/src/app/painel/grupos/page.tsx
git commit -m "feat(comunidades): tela de comunidades, faixa de orfaos e item de menu"
```

Antes de abrir o PR: `git fetch origin main` e conferir a defasagem. Mais de ~20 commits atrás → atualizar a branch antes.

- [ ] **Step 10: Mover o card do quadro**

```sql
select public.move_card('<key>', 'no_ar_nao_verificado', 'Fase 2 mergeada', 'PR #N');
```

`no_ar_verificado` só depois de abrir em produção e ver funcionar — mergeado não é verificado.

---

## Próximo plano

As fases 3 (`group_participants` + alcance real + sugestão de cobertura), 4 (disparo pela comunidade e pelo grupo de Avisos) e 5 (link distribuidor `/c/[slug]`) ganham plano próprio, escrito depois que a Fase 2 estiver em produção. Elas dependem da tela da Fase 2 existir, não do resultado da Fase 0 — sobrevivem mesmo se o WhatsApp recusar a criação por API.
