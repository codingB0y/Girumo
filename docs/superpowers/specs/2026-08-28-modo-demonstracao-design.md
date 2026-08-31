# Modo demonstração — desenho

> **REVERTIDO em 31/08/2026.** O modo demonstração saiu do produto: não
> fazia sentido com a estratégia. O `/demo`, a rota de captura, os componentes e
> a lib foram removidos; o CTA principal da landing passou a apontar para o
> WhatsApp de vendas. A tabela `demo_requests` continua nos dois bancos, inerte.
> Este documento fica como registro do desenho e das armadilhas encontradas.

> **Data:** 28/08/2026 · **Status:** aprovado pelo Igor em 28/08/2026
> **Fase 3 do paid-first, PR 1 de 2.** O PR 2 é a instrumentação do funil por coorte.
> Contexto: [`2026-08-27-pricing-paid-first.md`](../../strategy/2026-08-27-pricing-paid-first.md)

## Problema

O FREE morreu na Fase 2 (`active = false` nos dois bancos) e, com ele, a única
porta de prova gratuita. Sobrou um buraco aberto em produção: o CTA principal da
landing aponta para `/signup` em todos os pontos (nav, hero, footer, sticky
mobile), e o signup faz `router.replace("/painel")` — sem checkout, sem paywall.
Quem clica no botão principal hoje ganha uma conta sem assinatura, que cai em
`BLOCKED_LIMITS` e não consegue fazer nada.

Isso não é só conversão perdida: é a fábrica exata do arrependimento que o
gatilho **G1** (revisão de 28/08) passa a medir.

## Decisão

Superfície própria em `/demo`, client-only, com dados simulados e **sem instância
Evolution conectada** — zero RAM, zero fila de suporte, zero risco de ban. O
visitante conduz o ritmo: cada etapa espera um clique e então se anima sozinha.
No fim, CTA "agendar demonstração" capturando nome e WhatsApp.

### Abordagens descartadas

- **Reusar os componentes reais do painel** (sem drift por construção): as
  páginas do painel são client components que fazem `fetch` no `useEffect`;
  extrair a camada de dados de `contatos`, `campanhas`, `grupos` e `disparos` é
  refatorar quatro telas de um produto pago para servir uma página de marketing.
- **Tenant de demo real + sessão de demonstração** (painel funciona intocado):
  sessão real com `tenant_id` real, num sistema onde o `.eq('tenant_id')` é a
  proteção e 68 arquivos usam service-role. Qualquer caminho de escrita do painel
  gravaria linha de verdade, e não existe camada read-only.

## Arquitetura

```
apps/web/src/app/demo/page.tsx                 server component, estático
apps/web/src/components/demo/demo-flow.tsx     "use client" — estado = índice do passo
apps/web/src/components/demo/steps/*.tsx       as quatro telas encenadas
apps/web/src/lib/demo/script.ts                roteiro puro (passos, narração, timings)
apps/web/src/lib/demo/fixtures.ts              dados falsos, tipados com os tipos reais
apps/web/src/app/api/demo/request/route.ts     captura pública
```

### Fronteira de segurança

**`/demo` entra em `isPublicPage` (`lib/public-pages`), não em `surfaceForPath`.**
A página é estática, e CSP com nonce em rota pré-renderizada é armadilha
conhecida deste repo: o nonce é gerado no build, não na request. É o mesmo motivo
de `/termos` e `/privacidade` estarem na lista pública. A lista mora em
`lib/public-pages` porque o middleware não roda sob `tsx --test` — de lá ela é
testável de verdade.

**A rota de captura exige um `AccessKind` novo.** Hoje `classifyRequest` só
produz `auth-rate-limited` pelo prefixo `/api/auth/`; `/api/demo/request` cairia
na última linha (`startsWith("/api/")` → `"user"`) e responderia **401 a todo
visitante anônimo** — a rota nasceria morta.

A correção é um `AccessKind` `"public-rate-limited"`, com **path exato** (`POST
/api/demo/request`), não prefixo. O branch no middleware é idêntico ao de
`auth-rate-limited`: limita por IP e segue. O nome existente serviria, mas mente
sobre o que a rota é — e este arquivo é deliberadamente exaustivo e fail-closed,
com teste próprio (`request-access-policy.test.ts`).

Path exato porque é a lição que o próprio arquivo já registra no bloco dos crons:
prefixo largo é como `DELETE /api/auth/account` nasceu fora do gate.

Em cima disso, `checkRateLimit` (`lib/security/rate-limit.ts`) no próprio
handler — o middleware protege o banco, o handler protege a tabela.

Nenhuma chamada a Evolution ou Supabase no fluxo do demo. O único servidor
envolvido é o POST da captura.

## Roteiro

Quatro passos. Cada um espera um clique e então se anima até o fim.

1. **Campanha pronta** — "3 grupos, uma novidade" → botão *Disparar*
2. **Disparo** — as mensagens saem com a cadência anti-ban visível; só posta no
   grupo, nunca em DM (é o comportamento real do produto)
3. **Grupo enchendo** — os leads entram um a um, o contador sobe
4. **Pedido caindo** — o primeiro pedido aparece

### Regra de conteúdo (não-negociável)

Rótulo permanente de **"demonstração — dados simulados"** na tela. Este
repositório já teve prova social fabricada em produção; um demo sem rótulo é a
mesma falha com roupa nova. E o roteiro só encena fluxo que existe de verdade.

## Fixtures e controle de drift

As fixtures importam **os tipos que as rotas reais devolvem**. Acoplamento em
tipo, não em runtime: se o contrato mudar, a fixture para de compilar e o `tsc`
do CI acusa.

Hoje o tipo `Lead` está declarado dentro de `app/painel/contatos/page.tsx` e não
é exportável. Extrair esses tipos para um módulo importável faz parte deste PR —
é melhoria dirigida ao trabalho em curso, não refactor oportunista.

## Captura do lead

Tabela nova, **sem `tenant_id`** (é pré-tenant), RLS ligada assim mesmo por
defesa em profundidade. Aplicada nos **dois** bancos, com a ordem registrada em
`deploy/supabase/apply-order.txt`.

```sql
create table if not exists public.demo_requests (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  phone        text not null,
  step_reached int,
  source       text not null default 'demo',
  created_at   timestamptz not null default now()
);
```

`step_reached` existe porque quem desiste no passo 2 e quem chega ao pedido são
leads diferentes — e é o campo que liga o demo à coorte do PR 2.

### Erro

O insert é a fonte da verdade. Se falhar, a resposta é **500 com o link do
WhatsApp de vendas** — a pessoa não se perde — e o e-mail dispara mesmo assim,
marcado como "não gravou no banco". Nada é engolido em silêncio.

O e-mail vai em `after()` (`lib/email/send.ts`), fora do caminho da resposta.

## Landing

O CTA principal (nav, hero, sticky mobile) passa a apontar para `/demo`. O
WhatsApp segue como secundário.

## Fora de escopo (deliberado)

- **Consertar o `/signup`.** Mandar o signup para o checkout é conserto de fluxo
  de cobrança e merece PR próprio. Este PR para de alimentar o buraco pelo botão
  principal; não o fecha.
- **Funil por coorte.** É o PR 2 da Fase 3.

## Testes

- `tsx --test`: o reducer do roteiro (puro) e a validação do payload da captura
  (nome obrigatório, telefone BR)
- E2E no CI: percorrer os quatro passos e submeter o formulário
- `tsc` nos dois projetos — é o gate que pega o drift das fixtures; lint e
  `tsx --test` não checam tipo
- `verify-local.ps1` antes do push
