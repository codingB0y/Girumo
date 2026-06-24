# PROJECT_RULES

Produto: **DevZap Groups** — SaaS p/ lotar grupos de WhatsApp via tráfego pago (Meta) e
gerir broadcast. Cliente-alvo: lojistas de atacado (Polo 44). Assinatura à parte.

## Regras de produto (invioláveis)
- **Sem IA** — copy/criativo via modelos prontos curados, não geração automática.
- **Sem evasão/stealth** — só controle operacional seguro (delay, rate limit, warmup, monitor).
  Recusar fingerprint/proxy/anti-detecção. Ver engine/DECISIONS.md.
- **Rastreio = Caminho A** — link de grupo encurtado (atribuição estimada pelo clique).
- **Meta Ads = kit manual** (app gera, lojista sobe no Gerenciador). API direta fica p/ depois.

## Regras de engenharia (OS V2)
- Não inspecionar repo inteiro; não reescrever código que funciona; não redesenhar arquitetura.
- Vertical slices, thin controllers, fat services. Evitar abstração sem 3+ usos.
- Orçamento: Small ≤4 arquivos/250 LOC, Medium ≤8/500. Excedeu → split + NEXT.md + stop.
- Toda task: build+types passam, NEXT.md atualizado, então para.
- Stack alvo backend: NestJS + Prisma + Postgres + Redis/BullMQ + JWT + Vitest.

## Contexto a carregar
PROJECT_RULES.md + NEXT.md + arquivos tocados. Opcional ARCHITECTURE.md. Máx 8 arquivos.
