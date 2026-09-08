# Início lenta: agregar a carga do painel numa chamada

**Aberto em** 07/09/2026, depois do PR #257. **Não executado** — este é o plano.

## O sintoma

A tela `/painel` demora a sair do skeleton. Confirmado pelo Igor em **produção**
("demora um pouco a sair o skeleton"), não só em ambiente local.

## O que já foi medido

| Ambiente | Tempo até a tela |
|---|---|
| `next dev` local, servidor quente | 8,9 s |
| CI (build + `next start`) | acima de 10 s |
| Produção | não cronometrado; confirmado que demora |

**Nenhum endpoint é lento sozinho**: medidos entre 0,5 s e 1,5 s cada, localmente.

## A causa

A tela dispara **15 chamadas** para renderizar:

- **10** do `useDashboardData` (`groups`, `campanhas`, `links`, `leads`, `orders`,
  `schedules`, `disparos`, `automations`, `session`, `settings`);
- **5** da casca (`auth/me`, `notifications`, `subscription`, `auth/account`,
  `admin/impersonate/status`).

Uma 16ª (`/api/admin/tenants/list`) só existe com `NEXT_PUBLIC_APP_ENV=development`.

Local, o custo é a fila: HTTP/1.1 abre 6 conexões por origem. Em produção a Vercel serve
em **HTTP/2**, então a fila não explica — lá o custo provável é outro:

1. **10 funções serverless distintas**, cada uma com seu cold start;
2. **10 resoluções de tenant**: cada rota chama `getRouteTenantContext` / `getTenantContext`
   por conta própria, com o round-trip de auth que isso implica;
3. o `Promise.all` no cliente bloqueia a tela inteira pela mais lenta — inclusive por
   `schedules`, que a Vitrine sequer recebe (só o `FullDashboard` antigo usa).

## O plano

**Uma rota agregada `GET /api/painel/inicio`** que resolve o tenant UMA vez e chama os dez
stores em paralelo no servidor, onde a latência até o Supabase é baixa e não existe limite
de conexões do browser.

Ganho estrutural, independente de qual endpoint é o mais lento hoje: 1 cold start em vez
de 10, 1 resolução de tenant em vez de 10, 1 round-trip em vez de 10.

### Etapas

1. **Ler as dez rotas** e listar, para cada uma, o store que ela chama no `GET`. Elas são
   finas — o padrão é `getRouteTenantContext` + `await listX(tenantId)`. Confirmar que
   nenhuma faz trabalho extra no GET (a de `campanhas` mistura links e landing pages;
   conferir).
2. **Criar `apps/web/src/app/api/painel/inicio/route.ts`**: resolve o tenant, roda os dez
   stores em `Promise.allSettled` e devolve o mesmo shape que o hook monta hoje, com um
   `ok` por parte — `allSettled`, não `all`: uma parte que falha não pode derrubar a tela
   inteira, que é exatamente a distinção `error` × `partial` que já existe.
3. **Testes puros** da montagem da resposta (parte falha → `ok:false` daquela parte; os três
   críticos falhando → erro). Matar com mutante antes de contar como cobertura.
4. **Trocar o `useDashboardData`** para uma chamada só. Manter EXATAMENTE a semântica atual:
   `session`/`campanhas`/`groups` falhando → `status: "error"`; qualquer outra falhando →
   `partial: true`.
5. **Medir antes e depois**, no mesmo ambiente, e escrever os dois números no PR.
6. Gates de sempre: `test`, `painel:check`, `brand:check`, `eslint`, os DOIS `tsc`, build.

### O que NÃO fazer aqui

- **Não** mexer nas cinco chamadas da casca: são de outro componente e outro ciclo de vida.
  Um problema por PR.
- **Não** apagar as dez rotas existentes: outras telas as consomem. A rota agregada é
  adicional.
- **Não** trocar por render progressivo em vez de agregar. Progressivo só ajuda se a
  chamada mais lenta for uma das não-críticas — e isso não foi medido. A agregação ajuda
  nos dois casos.

## Antes de começar

Vale um número de produção com o DevTools aberto (aba Network, `/painel`): qual chamada
demora mais e quanto. Se houver uma dominante e ela for não-crítica, render progressivo
pode ser mais barato que agregar. Sem esse número, agregar é a aposta segura.
