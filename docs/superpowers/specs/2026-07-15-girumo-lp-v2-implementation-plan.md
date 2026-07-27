# Girumo LP v2 — Plano de implementação

**Data:** 15 de julho de 2026
**Status:** plano executável; aguardando aprovação para iniciar a Fase 1
**Base branch:** `feat/lp-experience` (worktree isolado `feat/girumo-lp-v2`)
**Referência funcional:** [2026-07-14-girumo-landing-page-builder-design.md](./2026-07-14-girumo-landing-page-builder-design.md)

## 0. Escopo travado da v1

- **Uma estrutura** (referência LUME): `Hero+Form` → `Depoimento 9:16` → `Benefícios+Galeria`, direção editorial-premium ("Acesso VIP").
- Construída em **seções componíveis** — arquitetura extensível para `3 estruturas × 2 direções` depois, **sem** entregá-las agora.
- **Sem dados de produção** → todas as migrações são **forward**, sem preservação de leads.
- **Vídeo = embed-only** (YouTube/Vimeo normalizado); sem upload/transcodificação.
- Entram todas as demais specs: editor guiado, upload de imagem/logo, captura sem checkbox + evidência, contato×captura, funil de 5 eventos, a11y AA, performance, migração/rollout.

## 1. Decisões resolvidas

| # | Decisão | Recomendação | Rationale |
|---|---|---|---|
| D1 | Armazenamento de conteúdo | **JSONB versionado** (`content_schema_version=2`) + validador server-side; adaptador do shape legado | layout fixo mobile-first mapeia limpo a JSON; normalizar em tabelas só adiciona joins sem ganho nesta escala |
| D2 | Estrutura/direção/versão | **Colunas** em `landing_pages` (`structure`, `visual_direction`, `model_version`) + contrato no template | dimensões consultáveis para analytics; template = contrato de campos/limites/mídia |
| D3 | Contato × captura | **`lp_contacts`** (único `tenant_id+whatsapp`) **× `lp_captures`** (página+versão+campanha→contato); remove `uniq(landing_page_id,whatsapp)` | spec §9.2/9.3; dedup global de contato, atribuição por página/versão |
| D4 | Eventos | **Canônicos novos + compat**: expandir CHECK, `getLpMetrics` lê canônico e back-mapeia legado | funil de 5 eventos sem quebrar leitura existente (opção 2 do prompt) |
| D5 | Mídia | Reúso `/api/media`; imagem→10MB, logo→5MB; servir **derivado** (nunca o bruto); vídeo = normalize URL→`{provider,id}` + iframe pós-interação | infra de upload já existe e é quota-aware |
| D6 | RLS | Idioma `app.user_tenant_ids()` (defesa em profundidade); `service_role` = gate primário; migração `> 20260713…` | converge com `feat/evolution-migration`, evita drift |
| D7 | Consent | Sem checkbox; clique no CTA = ação afirmativa; snapshot `notice_text + notice_version + published_version + campanha + origem + device` | spec §8.2/§13; base legal fica **pendente de validação jurídica** |

## 2. Fase 1 — Domínio & banco (espinha) · "contrato primeiro"

### 2.1 Arquivos
- **criar** `apps/web/src/lib/pages/content.ts` — `LpContentV2` + limites + `validateContentV2` + adaptador legado.
- **criar** `apps/web/src/lib/pages/phone.ts` — move `normalizeWhatsappBR` (+ testes isolados).
- **criar** `apps/web/src/lib/pages/palette.ts` — deriva paleta acessível da cor da marca + contraste WCAG (≥4,5:1).
- **criar** `apps/web/src/lib/pages/video.ts` — normalize/validate YouTube/Vimeo → `{provider, id}`.
- **editar** `apps/web/src/lib/pages/schema.ts` — re-exporta; mantém `LpColor` legado como fallback.
- **editar** `apps/web/src/lib/pages/store.ts` — `lp_contacts`/`lp_captures`.
- **criar** `apps/web/supabase/migrations/20260715090000_lp_v2.sql`.
- **testes-primeiro**: `content.test.ts`, `phone.test.ts`, `palette.test.ts`, `video.test.ts`.

### 2.2 Interfaces TS (núcleo)
```ts
export type LpStructure = "conversion";              // v1: só esta (extensível)
export type LpVisualDirection = "premium";
export const CONTENT_LIMITS = {
  badge: 30, headline: 72, description: 180, cta: 32,
  benefit_title: 40, benefit_desc: 90,
} as const;

export type LpMediaRef = { media_id: string; alt: string; focal_x?: number; focal_y?: number };
export type LpVideoRef = { provider: "youtube" | "vimeo"; id: string; poster?: LpMediaRef };

export type LpContentV2 = {
  schema_version: 2;
  store_name: string;
  logo?: LpMediaRef | null;
  brand_color: string;            // hex; paleta derivada em runtime
  badge?: string;
  headline: string;
  description: string;
  cta: string;
  hero: LpMediaRef;
  benefits: { title: string; description: string }[];  // até 3
  gallery: LpMediaRef[];                                // 2–6
  proof?: { kind: "video"; video: LpVideoRef; name: string; store: string; city: string; quote: string }
        | { kind: "photo"; photo: LpMediaRef; name: string; store: string; city: string; quote: string }
        | null;
};

export type LpContact = { id: string; tenant_id: string; name: string | null; whatsapp: string;
  blocked_at: string | null; created_at: string; updated_at: string };

export type LpCapture = { id: string; tenant_id: string; landing_page_id: string; contact_id: string;
  published_version: number; campaign_slug: string | null;
  structure: LpStructure; visual_direction: LpVisualDirection; model_version: number;
  notice_version: string; notice_text: string; device: string | null;
  utm: Record<string,string|null>; idem_key: string;
  group_clicked_at: string | null; created_at: string };
```

### 2.3 Migração SQL (completa, reversível — `20260715090000_lp_v2.sql`)
```sql
-- landing_pages: dimensões do modelo + versionamento
alter table landing_pages
  add column if not exists structure text not null default 'conversion'
    check (structure in ('conversion')),
  add column if not exists visual_direction text not null default 'premium'
    check (visual_direction in ('premium')),
  add column if not exists model_version int not null default 1,
  add column if not exists content_schema_version int not null default 2,
  add column if not exists notice_version text not null default 'v1',
  add column if not exists published_version int not null default 0;

-- CONTATO: único por tenant+whatsapp
create table if not exists lp_contacts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references organizations(id) on delete cascade,
  name       text,
  whatsapp   text not null,                 -- E.164 BR
  blocked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, whatsapp)
);
create index if not exists idx_lp_contacts_tenant on lp_contacts(tenant_id);
alter table lp_contacts enable row level security;
create policy lp_contacts_select_member on lp_contacts
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));

-- CAPTURA: por página+versão+campanha, referencia contato
create table if not exists lp_captures (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,
  landing_page_id   uuid not null references landing_pages(id) on delete cascade,
  contact_id        uuid not null references lp_contacts(id) on delete cascade,
  published_version int  not null default 0,
  campaign_slug     text,
  structure         text not null,
  visual_direction  text not null,
  model_version     int  not null default 1,
  notice_version    text not null,
  notice_text       text not null,          -- snapshot da prova
  device            text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  fbclid text, gclid text, ttclid text, referrer text,
  idem_key          text not null,          -- chave idempotente do envio
  group_clicked_at  timestamptz,
  created_at        timestamptz not null default now(),
  unique (landing_page_id, published_version, contact_id, idem_key)
);
create index if not exists idx_lp_captures_tenant on lp_captures(tenant_id);
create index if not exists idx_lp_captures_page on lp_captures(landing_page_id);
create index if not exists idx_lp_captures_contact on lp_captures(contact_id);
alter table lp_captures enable row level security;
create policy lp_captures_select_member on lp_captures
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));

-- EVENTOS: funil de 5 + dimensões + idempotência
alter table lp_tracking_events
  drop constraint if exists lp_tracking_events_event_name_check;
alter table lp_tracking_events
  add constraint lp_tracking_events_event_name_check
  check (event_name in (
    'page_view','form_start','lead_submit_attempt','lead_created','group_click', -- canônicos
    'PageView','Lead','GroupJoin'                                                 -- legado (compat)
  ));
alter table lp_tracking_events
  add column if not exists published_version int,
  add column if not exists structure text,
  add column if not exists visual_direction text,
  add column if not exists model_version int,
  add column if not exists device text,
  add column if not exists idem_key text;
create unique index if not exists uq_lp_events_idem
  on lp_tracking_events(landing_page_id, event_name, idem_key) where idem_key is not null;

-- lp_leads: sem dados de produção → desativado como caminho de escrita (mantido vazio p/ rollback)
-- (nenhum drop: rollback reativa store legado)

-- ROLLBACK (reversível):
--   drop table if exists lp_captures; drop table if exists lp_contacts;
--   alter table landing_pages drop column ... (structure, visual_direction, model_version,
--     content_schema_version, notice_version, published_version);
--   restaura CHECK antigo de event_name e remove colunas/idx de eventos.
```

### 2.4 Critérios de aceite (Fase 1)
- `content.test.ts`: limites exatos (badge 30/headline 72/desc 180/cta 32/benefit 40+90; galeria 2–6); adaptador legado → v2 sem perda.
- `phone.test.ts`: casos BR válidos/ inválidos (DDD 11–99, 10–11 dígitos, com/sem +55).
- `palette.test.ts`: deriva ≥4,5:1; ajusta e explica quando insuficiente.
- `video.test.ts`: normaliza `youtube.com`, `youtu.be`, Shorts, `vimeo.com` → `{provider,id}`; rejeita HTML/iframe/URL arbitrária.
- Migração aplica e reverte limpa (validar via Supabase MCP em branch de dev, sem prod).
- **Checkpoint → commit** `feat(lp): domain v2 (content limits, contact/capture, events, video)`.

## 3. Fase 2 — Template público (estrutura única)
- **criar** `components/pages/templates/tokens.ts` (paper/ink/wine/line + escala tipográfica editorial), `sections/{Hero,LeadForm,VideoProof,BenefitsGallery,Footer}.tsx`, `structures/ConversionEditorial.tsx`.
- **editar** `templates/index.ts` (registry → nova estrutura; `basic` permanece fallback), `p/[slug]/page.tsx` (**remover `targetUrl` do contrato client**; destino só via POST).
- Vídeo: iframe criado **após clique** na capa; `preload="none"`, legenda, controles, sem autoplay c/ áudio.
- Imagens: `hero` eager + dimensões reservadas; galeria/abaixo-da-dobra lazy; servir derivado.
- CTA fixo mobile só quando o form estiver abaixo da 1ª dobra → rola pro mesmo form.
- Aceite: render mobile+desktop fiel à referência; a11y AA; sem vazar destino no HTML.

## 4. Fase 3 — Editor & mídia
- **editar** `components/pages/editor/form.tsx` → grupos recolhíveis (Identidade / Chamada / Mídia / Captação / Rastreamento); **remove URL manual de foto**.
- **criar** `components/pages/editor/upload-field.tsx` (usa `POST /api/media`), `crop-focal.tsx`, galeria de seções, preview **mobile-default + toggle**, autosave (debounced PATCH), erros por campo.
- **editar** `api/media/route.ts` (imagem 6→10MB, logo 5MB) + servir derivado otimizado.
- Aceite: publica sem URL manual; upload interrompido preserva demais campos; troca de campo não quebra layout.

## 5. Fase 4 — Captura, privacidade & analytics
- **editar** `components/pages/lead-form.tsx` — **remove checkbox**; aviso visível junto ao CTA; clique = ação afirmativa; sucesso em 2 etapas: "Cadastro concluído. Agora toque para entrar no grupo." + CTA WhatsApp oficial.
- **editar** `api/p/lead/route.ts` — deixa de exigir `consent===true`; grava contato (upsert por tenant+whatsapp) + captura (idem_key, notice snapshot+versão, published_version, device); emite `lead_created`; destino só após sucesso.
- **editar** `api/p/track/route.ts` + `analytics.ts` — eventos `page_view/form_start/lead_submit_attempt/group_click` idempotentes; `getLpMetrics` canônico + back-map legado.
- Aceite: reenvio/recarregamento não infla métricas; funil de 5 eventos com dimensões; group_click registrado antes de abrir o link.

## 6. Fase 5 — Migração & rollout
- Seeds legados (`promo-relampago`/`sorteio-premio`/`catalogo-grupo`) → mapear a **"Oferta Impacto"** (`conversion`/`premium`, `model_version=1`), slugs/URLs preservados.
- **Feature flag** para o novo editor; `BasicTemplate` permanece como rollback; observabilidade (log de erro operacional de link indisponível).
- Aceite: URLs/pixels/UTMs preservados; rollback documentado reverte migração + render.

## 7. Testes, a11y e performance (transversal)
- **Unit**: telefone, limites, paleta/contraste, normalização de vídeo, idempotência.
- **Integração**: upload→derivado, contato+captura, isolamento por tenant, publish→resolução pública.
- **E2E** (Playwright): editar→publicar→capturar→abrir grupo; falha de rede + retry; mobile+desktop.
- **A11y**: labels associados, foco visível, teclado, erros em texto, leitor de tela no form; `prefers-reduced-motion`.
- **Perf**: LCP ≤2,5s / INP ≤200ms / CLS ≤0,1 (Lighthouse lab + evidência).

## 8. Gate jurídico (bloqueia lançamento, não implementação)
Redação final do aviso e base legal (legítimo interesse × consentimento) marcadas para validação jurídica antes de publicar. Não declarar conformidade automática.
