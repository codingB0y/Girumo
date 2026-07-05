# HubFlow Pages — Briefing Inicial

**Data:** 2026-07-02
**Status:** Ideia — aguardando revisão dos squads
**Origem:** Conversa sobre modelo de negócio + análise de product council

---

## TL;DR

Criar módulo de landing pages com templates prontos integrado ao funil WhatsApp. Lojista escolhe template, personaliza 5 campos, publica em `hubflow.com.br/p/{slug}`. Lead preenche nome + WhatsApp ANTES de entrar no grupo, gerando leads ricos com UTMs, fbclid, gclid, ttclid. Tracking server-side via CAPI/GA4 Measurement Protocol/TikTok Events API.

---

## Por que isso importa

- **80% dos lojistas brasileiros não sabem fazer LP.** Quem tem LP converte 3-5x mais.
- **HubFlow hoje é "ferramenta de link".** Com LP, vira **stack completa de captação**.
- **Diferencia de Z-API, Take Blip, WPPConnect.** Nenhum concorrente tem isso no Brasil.
- **PLG natural:** cada LP publicada vira página indexada no Google → SEO compounding → mais leads pra HubFlow.
- **Aumenta LTV e reduz churn.** Cliente não sai porque perde a infraestrutura.

---

## Restrições (não mudar)

- ✅ Logomarca HubFlow
- ✅ Paleta de cores (breu, bruma, aco, iris, iris-claro, iris-escuro, sucesso, atencao, alerta)
- ✅ Stack do projeto (Next.js 15 + Supabase + Tailwind)

## Decisões já tomadas (não revisáveis)

- ❌ NÃO codar nada agora — squads revisam antes
- ❌ NÃO definir pricing agora
- ❌ NÃO tocar landing page atual
- ❌ NÃO remover links rastreados — LP **complementa**, não substitui

---

## Fluxo do lead (3 etapas)

```
1. Visitante chega na LP
   └─► PageView (Pixel + GA4 + CAPI)
   └─► Salva: referrer, UTMs, fbclid, gclid, ttclid

2. Visitante preenche nome + WhatsApp (opcional mas recomendado)
   └─► Lead event (Pixel + GA4 + CAPI)
   └─► Cria registro na tabela leads
   └─► Inicia conversa WhatsApp via Evolution API

3. Lead é adicionado ao grupo
   └─► GroupJoin event
   └─► Atualiza leads.status = 'enviado_grupo'
   └─► Atualiza leads.entered_group_at
```

---

## Schema proposto (referência, não final)

```sql
landing_page_templates (
  id              uuid pk,
  slug            text unique,  -- 'black-friday', 'sorteio', 'atacado'
  name            text,
  niche           text,         -- 'varejo', 'atacado', 'servico'
  thumbnail_url   text,
  component_key   text,         -- nome do componente React
  default_copy    jsonb,
  required_fields text[],
  created_at      timestamptz
)

landing_pages (
  id              uuid pk,
  tenant_id       uuid fk,
  template_id     uuid fk -> landing_page_templates,
  slug            text unique,
  content         jsonb,        -- placeholders preenchidos
  target_group_id uuid fk,
  whatsapp_number text,
  meta_pixel_id   text,
  ga4_id          text,
  tiktok_pixel_id text,
  status          text,         -- 'draft' | 'published' | 'paused'
  published_at    timestamptz,
  views_count     int default 0,
  leads_count     int default 0,
  meta_title      text,
  meta_description text,
  meta_image_url  text,
  created_at      timestamptz,
  updated_at      timestamptz
)

leads (
  id              uuid pk,
  tenant_id       uuid fk,
  landing_page_id uuid fk,
  campaign_id     uuid fk,
  name            text,
  whatsapp        text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  fbclid          text,
  gclid           text,
  ttclid          text,
  referrer        text,
  user_agent      text,
  ip_hash         text,
  country         text,
  city            text,
  status          text,         -- 'novo' | 'enviado_grupo' | 'engajado'
  consent_at      timestamptz,  -- LGPD
  entered_group_at timestamptz,
  created_at      timestamptz
)

tracking_events (
  id              uuid pk,
  tenant_id       uuid fk,
  landing_page_id uuid fk,
  event_name      text,
  event_data      jsonb,
  sent_to_meta    boolean,
  sent_to_ga4     boolean,
  sent_to_tiktok  boolean,
  created_at      timestamptz
)
```

---

## Templates prioritários (7)

Por **gatilho psicológico**, não por estética:

| Slug | Nome interno | Gatilho | Nicho |
|------|--------------|---------|-------|
| `promo-relampago` | Promoção relâmpago | Escassez + urgência | Varejo |
| `sorteio-premio` | Sorteio de prêmio | Sorte + ganância | Captação massiva |
| `catalogo-grupo` | Catálogo no grupo | Curiosidade | Lojista com catálogo |
| `pre-venda` | Pré-venda exclusiva | Exclusividade | Lançamento |
| `atacado-grupo` | Atacado no grupo | Exclusividade B2B | Atacadista |
| `agendamento` | Agendamento aberto | Urgência | Serviço local |
| `ultima-unidade` | Última unidade | Escassez extrema | Loja pequena |

---

## Editor (form simples, NÃO drag-and-drop)

Lojista quer fazer em **2 minutos**:

1. Escolher template
2. Botar nome da loja
3. Botar foto (opcional)
4. Botar WhatsApp / grupo
5. Escrever 1 frase
6. Escolher cor (3-4 opções)
7. Publicar

**Editor = form com preview ao vivo.**

---

## Decisões abertas (pra cada squad revisar)

### Product Squad
1. Lead captura nome+WhatsApp ANTES de redirecionar pro grupo? (recomendo sim — leads 100x mais valiosos)
2. Templates por gatilho psicológico (lista acima) faz sentido pro público?
3. Anti-spam: checkbox de consentimento obrigatório? Quem é o responsável jurídico?

### Tech Squad
4. Render via Next.js Route Handler + ISR (`/p/[slug]`) — viável?
5. Tracking server-side (CAPI, GA4 MP, TikTok Events) — fila por cron ou fila em tempo real?
6. Schema proposto está OK? Falta alguma coisa?
7. Custom domain via Vercel Domains API — viável no plano atual?

### Growth Squad
8. Biblioteca de Copy por nicho (textos prontos) faz sentido?
9. Captura cliente no Aha Moment (LP em draft > 48h) — boa ideia?
10. Indexação SEO automática de LPs publicadas (sitemap, OG, Schema.org) — prioridade?

---

## Métricas de sucesso

- ⏱️ Tempo de publicação da LP < 2 minutos
- 📈 Taxa de conversão (views → leads) > 15%
- 🎯 Tracking server-side captura > 95% dos eventos
- 🚀 LCP < 2s em mobile
- ♿ Lighthouse > 90 desktop / > 80 mobile

---

## Próximo passo

Cada squad (Product, Tech, Growth) revisa as decisões abertas acima e responde com:

1. ✅ Concorda / ❌ Discorda / 🤔 Precisa de mais info
2. Sugestões técnicas ou de produto
3. Riscos que o briefing não cobriu
4. Estimativa de esforço

Quando os 3 squads aprovarem, aí sim começa a implementação.