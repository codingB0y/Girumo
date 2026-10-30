# Rastreio do pedido — PR 7: Privacidade e prova (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A política de privacidade diz o que o Rastreio guarda e por quanto tempo, e o card `rastreio-pedidos` chega a
`no_ar_verificado` com prova colhida em produção.

**Architecture:** Uma mudança de texto em `/privacidade` (+ versão dos documentos legais, que é o que o aceite grava) e
um roteiro de prova sem código, feito na loja-piloto com um pedido de teste do próprio Igor.

**Tech Stack:** Next.js (página estática), `node:test` (`lib/legal.test.ts`), SQL de leitura em prod, `curl`.

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§7 Segurança e LGPD, §8 Testes, §10).
**Índice:** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` — Contrato, Global Constraints e Review
Focus valem aqui.

## Antes de começar

- Branch `feat/rastreio-pr7-privacidade`, worktree a partir de `origin/main` (`git fetch origin main` antes).
- A Task 1 só depende do PR 1 (o que é guardado). A Task 2 (prova) exige em `main` e em produção os PRs 3, 4 e 6;
  o WhatsApp entra na prova se o PR 5 já estiver no ar (senão a prova cobre página + e-mail e o card fica com
  `blocker` "WhatsApp espera a base do privado"). Conferir:
  `git log origin/main --oneline --grep "rastreio"`.

## Arquivos

| Arquivo | O quê |
|---|---|
| `apps/web/src/app/privacidade/page.tsx` | item novo em §3, linha em §2 e em §7 |
| `apps/web/src/lib/legal.ts` | `LEGAL_VERSION` e `LEGAL_EFFECTIVE_DATE` do dia |
| `apps/web/src/lib/legal.test.ts` | trava o texto novo |

### Task 1: Política de privacidade

**Files:**
- Modify: `apps/web/src/app/privacidade/page.tsx` (§2 linhas 33–36, §3 lista linhas 46–77, §7 linhas 144–150)
- Modify: `apps/web/src/lib/legal.ts:13-14`
- Test: `apps/web/src/lib/legal.test.ts`

**Interfaces:**
- Consumes: nada de outros PRs (o texto descreve as colunas do PR 1).
- Produces: `LEGAL_VERSION` novo (o aceite dos termos grava a versão).

- [ ] **Step 1: Escrever o teste que falha**

```ts
test("a privacidade descreve o rastreio do pedido", () => {
  const html = readFileSync(join(__dirname, "../app/privacidade/page.tsx"), "utf8");
  assert.match(html, /Rastreio do pedido/);
  assert.match(html, /Yampi/);
  assert.match(html, /90 dias depois da entrega ou do cancelamento/);
  assert.match(html, /nunca em texto/); // documento só como código irreversível
  assert.doesNotMatch(html, /CPF completo/);
});
```

(Use o mesmo jeito de ler o arquivo que os testes vizinhos de `legal.test.ts` já usam para `termos` e `privacidade`.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --workspace apps/web test -- --test-name-pattern "rastreio do pedido"`
Expected: FAIL em `Rastreio do pedido`.

- [ ] **Step 3: Escrever o texto**

§3 "O que coletamos", item novo depois do Instagram (texto exato):

> **Rastreio do pedido (quando a loja liga):** número, etapas, transportadora e código de rastreio dos pedidos da
> loja, lidos da Yampi da loja, e da compradora o primeiro nome, o celular e o e-mail (o e-mail guardado cifrado). O
> CPF ou CNPJ nunca fica em texto: guardamos só um código irreversível, que serve para a busca na página de
> rastreio. Usamos esses dados apenas para mostrar o andamento do pedido e mandar os avisos de entrega por e-mail e
> WhatsApp.

§2, "Dados dos seus contatos": acrescentar "os pedidos da sua loja que acompanhamos para avisar a compradora" à lista.
§7, nova frase no fim: "Os dados do rastreio do pedido são apagados 90 dias depois da entrega ou do cancelamento."
`LEGAL_VERSION` = data do merge (`AAAA-MM-DD`, com `.2` se já houver outra versão no mesmo dia) e
`LEGAL_EFFECTIVE_DATE` por extenso.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --workspace apps/web test -- --test-name-pattern "rastreio do pedido|versao e contato"`
Expected: PASS nos dois.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/privacidade/page.tsx apps/web/src/lib/legal.ts apps/web/src/lib/legal.test.ts
git commit -m "docs(legal): order tracking data in the privacy policy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Prova em produção e card

Sem código. Cada passo grava a evidência no texto do `move_card` (nunca CPF, telefone, e-mail ou nome; número do
pedido de teste pode). Roteiro feito pelo Igor na loja-piloto, com um pedido de teste dele mesmo.

- [ ] **Step 1: Pré-condições (Igor)** — `RASTREIO_DOC_PEPPER` nos dois ambientes da Vercel; Yampi conectada;
  B·2a em `main` e o worker reimplantado no Coolify **antes** de ligar a flag (regra da base); `rastreio_enabled`
  ligado pelo admin; a loja confirma que a política de privacidade dela menciona aviso de pedido
  por e-mail e WhatsApp (ela é a controladora); se o PR 5 estiver no ar, o número do atendimento conectado e, sem o
  Recuperar, a mensagem de ausência ligada (spec §1.4).
- [ ] **Step 2: Página e registros**

```powershell
curl.exe -sI https://www.girumo.com.br/rastreio/<slug-da-piloto>
curl.exe -s https://www.girumo.com.br/robots.txt
```

Expected: `200`, `x-robots-tag: noindex`, `cache-control: private, no-store`, CSP com `nonce-` e `strict-dynamic`;
`robots.txt` com `Disallow: /rastreio/`. `https://app.girumo.com.br/rastreio/<slug>` → `308` para o `www`.
- [ ] **Step 3: Importação** — depois do primeiro cron com a flag ligada, em prod (só leitura):
  `select etapa, count(*) from public.tracking_orders where tenant_id = '<piloto>' group by etapa;` → pedidos dos
  últimos 30 dias, e `select count(*) from public.tracking_notices where tenant_id = '<piloto>';` → **0** (a importação
  não avisa).
- [ ] **Step 4: Aviso de verdade** — o Igor compra na loja (pedido de teste) e a loja marca "Em transporte" com um
  código. Em até 10 min: e-mail recebido com o nome da loja como remetente; WhatsApp recebido (se o PR 5 estiver no
  ar) com o texto exato do §1.4; `tracking_notices` do pedido em `enviado`/`entregue`.
- [ ] **Step 5: Busca** — na página da loja, CPF + 4 últimos dígitos do celular do pedido de teste → o pedido aparece;
  com um dígito trocado → "Não encontramos pedido com esses dados. Confira o CPF/CNPJ e o celular."; seis buscas no
  mesmo minuto → "Muitas tentativas, tente daqui a pouco".
- [ ] **Step 6: Parar avisos** — no link do aviso, "Não quero mais receber avisos"; a loja marca "Entregue" → nenhum
  aviso novo (`tracking_notices` da etapa `entregue` inexistente ou `pulado`).
- [ ] **Step 7: Painel** — Vendas › Entregas mostra o pedido com as etapas e os canais; Configurações › Rastreio de
  pedidos mostra o número do atendimento e a matriz; o cartão da Yampi mostra a saúde do código.
- [ ] **Step 8: Card** — em prod:

```sql
select public.move_card('rastreio-pedidos', 'no_ar_verificado',
  'Prova em prod: página, busca, aviso por e-mail<, WhatsApp>, parar avisos e Entregas',
  'PRs #<n1>…#<n7>; pedido de teste <nº>; tracking_notices <ids>; <data>');
```

Sem o WhatsApp no ar: `no_ar_nao_verificado` com `blocker` = "WhatsApp espera a base do privado (B·2a–B·4)". A prova
vence em 30 dias.

## Interface com os outros PRs

- Consome: tudo da série no ar (3, 4, 6 e, se houver, 5). Produz: `LEGAL_VERSION` nova.
- Fecha a série: depois deste PR, registrar a decisão no grafo (prompt da sessão).
