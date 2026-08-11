# Plano de implementação — Aba "Páginas" (Flow Pages) · Girumo

> Gerado em **11/08/2026** ao fim da sessão de decisão conduzida sobre
> `docs/plano-aba-paginas-opus5.md`. Contém **apenas o que o Igor escolheu**.
> Baseline: `origin/main`. Toda branch nova parte de `main`.

## Decisões registradas

| # | Decisão | Escolha |
|---|---|---|
| §5 | Reconstruir do zero? | **Não — evoluir** (9,0 × 3,4) |
| D1 | Destino do lead capturado | **A** — unificar com o CRM (write-through) |
| D2 | Funil visível por página | **A** — funil completo com quebra por device/UTM |
| D3 | Gestão da lista | **A** — duplicar, arquivar, excluir |
| D4 | Evolução do modelo | **A** — blocos opcionais, Fase 4, começando por contagem regressiva |
| D5 | Distribuição do link | **A** — QR + compartilhar no WhatsApp + nav mobile |
| D6 | Fechar o loop com o grupo | **A** — medir entrada real (score recalculado 6,9 → **8,2**) |
| D7 | Higiene técnica | checklist, acompanha o resto |

## Achado que reorganizou o plano (verificado em 11/08)

O documento original tratava D6 como épico condicionado a "a engine expor membership de grupo".
**A condição já está satisfeita:**

- `apps/worker/src/lead-capture.ts` consome `group-participants.update` e cria lead a cada
  **entrada real em grupo**; `apps/worker/src/participants.ts` trata `@lid` (que não carrega
  telefone verdadeiro) sem inventar número.
- `leads` em **prod** tem `phone`, `name`, `source_group_id`, `source_group_name`,
  `source_campaign`, `status`, `entered_at`, `last_seen_at`, `also_in`, `metadata` —
  e está com **6 linhas, 100% com `source_group_id` preenchido**. O mecanismo produz dado hoje.
- Formato do telefone bate: `leads.phone` e `lp_contacts.whatsapp` guardam 12–13 dígitos,
  100% com DDI 55. A chave de join já existe.

**Consequência:** D1 e D6 não são duas features — são **uma linha de trabalho com dois produtores**
escrevendo o mesmo registro `leads` por (tenant, telefone canônico): a LP escreve na captação
(origem, campanha, UTM), o worker enriquece na entrada do grupo (`source_group_id`, `entered_at`).

**Desvio em relação ao §7 do documento:** o §7 colocava D2 (funil) na Fase 1. Aqui D2 vai para
**depois** de D1+D6, para o funil ser construído **uma vez só**, já com os degraus finais
("virou contato" e "entrou no grupo"). Valor visível na Fase 1 fica garantido por D5 e D3,
que não dependem de nada.

---

## Fase 1 — "A aba circula e se administra"

Sem migração. Só web. Objetivo: consertar invisibilidade e destravar o uso recorrente.

### PR-1 · `feat(pages): kit de divulgação + Páginas na nav mobile` (D5A · 8,5)

- `apps/web/src/lib/painel-nav.ts`: incluir **Páginas** na nav mobile.
  **Decidido (11/08):** substituir *Resultados* por **Páginas**. Resultados é consulta de baixa
  frequência e sobrevive no menu lateral; Páginas é ação recorrente. Mobile continua com 4 slots.
- **QR code da página**, gerado **localmente no servidor** — nunca serviço externo
  (precedente do repo: QR do WhatsApp vazando para `quickchart.io`, corrigido em `9119f39f`).
  Conferir se já existe lib de QR no workspace antes de adicionar dependência.
  Saídas: PNG para impressão (bazar físico) e formato story (1080×1920).
- **Compartilhar no WhatsApp**: `navigator.share` com fallback `wa.me`, mensagem pronta
  (headline + link público). Não fere a regra anti-ban: quem posta é o lojista, manualmente,
  do aparelho dele — não é disparo da plataforma.

**Aceite:** pelo celular, o lojista chega em Páginas pela nav, abre a página, baixa o QR e
compartilha no WhatsApp em um toque.
**Gates:** sem migração · build + lint verdes.

### PR-2 · `feat(pages): duplicar, arquivar e excluir página` (D3A · 7,7)

- **Duplicar** — copia conteúdo, mídia, cor da marca, benefícios, prova e pixels.
  Gera **slug novo** e **`campaign_slug` novo** (reaproveitar o slug de campanha fundiria a
  atribuição de duas páginas e quebraria o funil do PR-5). Nasce como **rascunho**, nunca no ar.
  Não copia: métricas, capturas, `published_version`.
- **Arquivar** — some da lista, `/p/{slug}` para de servir, métricas preservadas,
  invalidar a tag de cache `lp:{slug}`.
  **Decidido (11/08):** página arquivada mostra tela **"captação encerrada"**, não 404 — o QR
  impresso continua circulando depois de a promoção acabar, e 404 é beco sem saída para quem escaneou.
- **Excluir** — oferecido **somente** para página nunca publicada e com zero capturas.
  Confirmação digitando o nome. Fora disso, só arquivar (há `lp_captures`/`lp_tracking_events`
  pendurados, e a partir da Fase 2 esse lead virou contato do CRM).

**Aceite:** duplicar a página da promoção anterior e publicar leva menos de 1 minuto;
arquivar não perde métrica; excluir não é oferecido para página com lead.
**Gates:** conferir por SQL se `landing_pages` já tem coluna de arquivamento **antes** de criar;
se precisar criar → migração nos **dois** bancos + `deploy/supabase/apply-order.txt` + advisors.

---

## Fase 2 — "O lead vira ativo" (D1A + D6A · linha única)

### PR-3 · `feat(pages): captura da LP cria contato no CRM` (D1A · 7,6)

- **Função canônica de telefone** (`lib/phone/canonical.ts`), fonte única usada pelos dois lados.
  Trata o nono dígito (55 + DDD + 8 **ou** 9 dígitos — a origem do 12 vs 13 observado em prod).
  Testes obrigatórios: par 12/13 dígitos do mesmo número deve casar.
- Na RPC transacional de captura (`lib/pages/capture.ts` + `store.ts`): além de `lp_contacts`/
  `lp_captures`, **upsert em `leads`** por (`tenant_id`, telefone canônico) com `name`,
  `source_campaign` = `campaign_slug`, `status` inicial e `metadata` com UTMs, página e
  `published_version`. Idempotência preservada.
- Aba **Contatos** passa a exibir a origem (LP + campanha + UTM).

**Aceite:** lead capturado numa LP aparece em Contatos com a origem correta e fica elegível a
automação — respeitando a regra anti-ban (automação **só posta no grupo, nunca DM ao lead**).
**Gates:** `leads` **não existe no banco de dev** (dev cai no fallback JSON) → migração nos
**dois** bancos, RLS + policy por tenant, advisors após DDL ·
`.eq('tenant_id', …)` explícito em toda query (service-role bypassa RLS — o filtro **é** a proteção) ·
`target_group_url` continua fora do client.

### PR-4 · `feat(pages): medir entrada real no grupo` (D6A · 8,2)

- Quando o worker processar `group-participants.update`, casar por (tenant, telefone canônico)
  e **enriquecer o mesmo registro `leads`** com `source_group_id`, `source_group_name`, `entered_at`.
- Métrica-mestra por página: **capturados → entraram no grupo**.
- **Risco nº 1 — falha silenciosa:** se a canonicalização divergir entre os lados, o painel
  reporta "0 entraram" com o lead dentro do grupo. Teste de match é bloqueante, não opcional.
- Nenhuma mensagem de boas-vindas, nenhuma DM (regra durável 1).

**Aceite:** existe, por página, o número "X capturados → Y entraram no grupo", com o match
coberto por teste incluindo o caso 12 vs 13 dígitos.
**Gates:** worker é workspace próprio (`apps/worker`) — varrer antes de assumir que algo não existe ·
sem DM · filtro de tenant explícito.

---

## Fase 3 — "O lojista vê o loop inteiro"

### PR-5 · `feat(pages): funil completo por página` (D2A · 7,7)

- Funil de **6 degraus**: `page_view` → `form_start` → `lead_submit_attempt` → `lead_created`
  → `group_click` → **entrou no grupo**.
- Quebra por **dispositivo** e por **origem** (5 UTMs + fbclid/gclid/ttclid + referrer).
- Números absolutos + taxa entre etapas. **Desenhar para n baixo** (barras horizontais;
  com 7 views históricas, gráfico de série temporal parece quebrado — série temporal era a
  opção D2-B, adiada).
- Sem migração: query sobre `lp_tracking_events` (coluna `event_name`) + `leads`.

**Aceite:** a página de detalhe mostra o funil inteiro, do primeiro view até a entrada no grupo,
com quebra por device e origem.
**Gates:** sem migração · filtro de tenant explícito · build + lint verdes.

---

## Fase 4 — Contínuo

### PR-6 · `feat(pages): bloco de contagem regressiva de turma/lote` (D4A · 6,5)

Único bloco desta rodada. É o que carrega a tese do produto (grupo VIP tem lotação e janela —
escassez real, não inventada). Preço âncora e FAQ **só entram** se o funil do PR-5 mostrar
queda entre `page_view` e `form_start`.
**Regra de corte acordada:** se a escolha for entre este PR e mais um item das Fases 1–3,
este cai. Bloco de conversão em página sem visita é decoração.

### D7 · Higiene técnica (checklist)

- [ ] Rate-limit das rotas públicas `/api/p/*` → Upstash (nota já está no código; Upstash na
      Vercel é ação pendente do Igor, também vale para auth).
- [ ] Confirmar backfill v2 em 100% das páginas e **aposentar o editor v1** + os 3 slugs de
      template que renderizam o mesmo `BasicTemplate`.
- [ ] Fechar o "gate §8" pendente do plano Girumo LP v2.
- [ ] Decidir o consumidor de `sent_to_meta` / `sent_to_ga4` / `sent_to_tiktok` (CAPI
      server-side): construir ou **remover as colunas**.

---

## Gates obrigatórios em todos os PRs

1. **Anti-ban:** automação/mensagem do lojista só posta **em grupo, nunca DM**.
2. **Multi-tenant:** `.eq('tenant_id', …)` explícito em toda query de store.
   Service-role bypassa RLS — o filtro é a proteção, RLS é segunda linha.
3. **Migrações nos dois bancos** (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`).
   Conferir por SQL se o objeto já existe **antes** de criar. `apply-order.txt` é a fonte da ordem.
   RLS + policy em tabela nova. Rodar advisors do Supabase após DDL.
4. **PR:** base sempre `main`, escopo de 1 coisa, revisar → CI → merge → deletar branch na
   mesma sessão. Build + lint verdes.
5. `target_group_url` nunca vai ao client — só o POST de captura devolve `redirect_url`.

## Armadilhas conhecidas (relembrar antes de codar)

- Branches quase homônimas: `feat/girumo-lp-v2` = módulo shipado; `feat/lp-girumo-v2` =
  landing de marketing, ~98 commits atrás. **Partir de `main`.**
- Flag `NEXT_PUBLIC_LP_EDITOR_V2`: só a string `"on"` liga.
- API routes são dual-mode com **fallback JSON silencioso** quando falta tabela —
  validar sempre contra o caminho Supabase, não contra o fallback.
- `/p/[slug]` é `force-dynamic` por causa do nonce CSP. Não "otimizar".
- Em worktree, `node_modules` vem por junction e o dev server pode subir do checkout principal
  (mede código antigo). Conferir antes de validar visualmente.

## Pendências resolvidas em 11/08

1. **PR-1 · nav mobile:** Páginas entra no lugar de *Resultados*; mobile fica com 4 slots.
2. **PR-2 · página arquivada:** `/p/{slug}` responde com tela "captação encerrada", não 404.

Nada trava o início do PR-1.
