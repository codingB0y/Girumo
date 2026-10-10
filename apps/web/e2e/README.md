# Smoke E2E do painel

Nasceu de 19/08/2026: dois bugs sérios (#114 componente órfão, #115 comando
preso na fila) passaram por CI, teste unitário e revisão. Só apareceram no uso
real.

## O que cada arquivo prova — e o que não prova

| Arquivo | Precisa de login | Prova |
|---|---|---|
| `auth.setup.ts` | — | Loga uma vez e grava a sessão para os demais reusarem |
| `auth-gate.spec.ts` | não | Nenhuma rota do painel abre sem sessão |
| `painel-rotas.spec.ts` | sim | Cada rota estática existe, renderiza e monta o shell |
| `painel-rotas-dinamicas.spec.ts` | sim | Cada tela de **detalhe** carrega o registro do id — e não carrega um id inexistente |
| `admin-gate.spec.ts` | sim | Nenhuma rota de `/admin` abre para lojista logado |
| `equipe-convite.spec.ts` | sim | Convidar → aparece → revogar → some |
| `sessao.spec.ts` | sim, com usuário próprio | Logout derruba o acesso |

**`auth-gate` não prova que a rota existe.** Redirect para `/login` sai igual
para rota real e para rota inventada, porque o middleware intercepta antes do
roteamento (achado de 17/08). Por isso existe ali um teste de controle com uma
rota falsa: se ele parasse de redirecionar, o resto do arquivo estaria medindo
outra coisa. Quem prova existência é `painel-rotas`, que precisa de sessão.

A lista de rotas sai do filesystem (`rotas.ts`), não de uma lista escrita à mão
— rota nova entra no smoke sozinha.

## Rodar

```bash
npm run web:e2e
```

Sem `E2E_EMAIL`/`E2E_PASSWORD` só o `auth-gate` roda entre os specs do usuário
de QA; o resto aparece como skipped, não como falha. `admin-rotas.spec.ts` e
`sessao.spec.ts` têm conta própria e dependem só do par deles (`E2E_ADMIN_*`,
`E2E_SESSAO_*`) — ver "Por que o `sessao.spec.ts` tem usuário próprio", mais
abaixo. Para a suíte inteira, use um usuário do Supabase de
**dev** — `qa-user@girumo.test` já existe lá, criado por
`npm run qa:prepare-brand`:

> **O tenant de QA precisa de assinatura ativa.** `qa:prepare-brand` cria uma no
> plano `PERFORMANCE_MAX`. Tenant sem linha em `subscriptions` recebe o teto do
> FREE (`lib/billing/entitlements.ts`), e o FREE traz `campaigns: 0` e
> `team_members: 1` — o fixture de campanha leva 402 no POST `/api/campanhas` e
> `equipe-convite.spec.ts` recebe 402 onde exige 201. Até 25/08/2026 a suíte
> passava sem assinatura nenhuma porque a ausência devolvia `{}`, que liberava
> tudo: ela vinha passando por causa de um defeito de cobrança, não apesar dele.
> Se a suíte começar a dar 402, confira a assinatura do tenant antes do código.

```powershell
$env:E2E_EMAIL = "usuario@dev"; $env:E2E_PASSWORD = "senha"; npm run web:e2e
```

O dev server sobe sozinho (`reuseExistingServer`). Contra outro alvo:
`$env:E2E_BASE_URL = "http://localhost:3000"`.

## No CI

Roda como o job `e2e` do workflow `Verify`, **só em PR**. O push em `main` não
repete: depois do squash o conteúdo é idêntico ao que acabou de passar no PR, e
cada run é cobrado à parte (a cota de 2.000 min/mês acabou em 28/08/2026).
Aponta para o Supabase de **dev**, com o mesmo `qa-user@girumo.test`.

Duas diferenças em relação ao local:

- O alvo é `next start` sobre um build (`E2E_WEB_COMMAND`), não `next dev`. O dev
  server compila cada rota no primeiro acesso, e as 24 rotas do painel viravam
  24 compilações em série dentro do timeout de 45 s por teste — o verde media a
  velocidade do compilador, não a saúde da rota.
- `reuseExistingServer` fica desligado, senão um build velho de outro job
  passaria por atual.

Os segredos vivem em Settings → Secrets do repositório, todos com prefixo
`E2E_`, e todos apontam para **dev** — nenhum valor de produção entra no CI:

| Segredo | O que é |
|---|---|
| `E2E_SUPABASE_URL` | URL do projeto Supabase de dev |
| `E2E_SUPABASE_ANON_KEY` | Chave anon de dev |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Service role de dev |
| `E2E_AUTH_SECRET` | Segredo próprio do CI, não o da máquina de ninguém |
| `E2E_EMAIL` / `E2E_PASSWORD` | Credencial do `qa-user@girumo.test` |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Admin de plataforma, só para `admin-rotas.spec.ts` |
| `E2E_SESSAO_EMAIL` / `E2E_SESSAO_PASSWORD` | Credencial do `qa-sessao@girumo.test`, só para `sessao.spec.ts` |

Faltando `E2E_SUPABASE_URL` ou `E2E_EMAIL`, o job se **pula com aviso** no
summary em vez de ficar vermelho: PR de fork não enxerga segredo, e CI vermelho
por falta de segredo é como o time aprende a ignorar a suíte. Faltando o par
`E2E_ADMIN_*` ou `E2E_SESSAO_*`, só o spec que usa aquele par se marca skip.

O relatório HTML sobe como artefato `e2e-report` (14 dias) mesmo quando a suíte
falha — sem isso, falha no CI vira "deu vermelho" sem screenshot de nada. Antes,
`infra/scripts/redigir-segredos-e2e.py` apaga as três senhas (QA, admin e sessão), inclusive do zip
em base64 que o Playwright embute no `index.html` (o título de todo `fill` é
`Fill "<valor>"`, de teste que passa também). Se a redação falhar, nada sobe.

Antes do build, o mesmo job roda os testes de integração das stores
(`apps/web/src/lib/stores/*.integration.test.ts`) contra o banco de dev: são os
únicos que provam leitura acima do teto de 1000 linhas do PostgREST, que corta
sem erro. Gravam no tenant de QA, derivado no próprio passo pelo login de
`E2E_EMAIL` (a membership aceita mais antiga, como faz a rota de login), com
chaves sorteadas a cada run — com chave fixa sob índice único, dois PRs em
paralelo se recusariam e um run cancelado travaria os seguintes. O passo
reprova se algum teste pular ou se nenhum rodar: teste pulado sai com código 0.
Run cancelado no meio do passo ainda deixa lixo no tenant de QA (leads de 2020
em grupos `cnttest-*`, participantes em `pagtest-*`, oferta de 2020 aberta em
`reltest-*`), mas nada que reprove o run seguinte.

**Não roda contra preview da Vercel**: preview não recebe env de Supabase, então
não existe login lá (achado de 11/08).

### Por que o `sessao.spec.ts` tem usuário próprio

O logout revoga **todas** as sessões do usuário, não só a do navegador que saiu
(`session_revocations` é por `auth_user_id`, #116). Enquanto o spec entrava com
o `qa-user@girumo.test`, cada run cortava a sessão de todo outro run de e2e no
ar ao mesmo tempo — CI de outro PR ou Playwright local, todos no mesmo banco de
dev. Em 23/09/2026 um corte derrubou dois runs alheios: 656 respostas 401 e
runs de ~18 min em vez de ~8. Era essa a "corrida de conexão" de 401 em
cascata vista desde 09/09.

Com conta própria o corte só alcança quem saiu. O spec também roda com
navegador limpo (o estado do setup traria o cookie do usuário compartilhado e o
aparelho lembrado, que preenche o login com o e-mail dele) e reprova se
`E2E_SESSAO_EMAIL` apontar para o mesmo usuário de `E2E_EMAIL`.

A conta existe só no Supabase de **dev**: criada confirmada em Authentication e
ligada ao tenant de QA como `operator` por este SQL (idempotente):

```sql
insert into public.memberships (tenant_id, user_id, role, accepted_at)
select o.id, u.id, 'operator'::member_role, now()
from public.organizations o, auth.users u
where o.slug = 'girumo-qa' and u.email = 'qa-sessao@girumo.test'
on conflict (tenant_id, user_id) do nothing;

insert into public.users (tenant_id, auth_user_id, email, name, metadata)
select o.id, u.id, u.email, 'Sessão Girumo QA', '{"fixture": true, "persona": "sessao"}'::jsonb
from public.organizations o, auth.users u
where o.slug = 'girumo-qa' and u.email = 'qa-sessao@girumo.test'
on conflict (tenant_id, auth_user_id) do nothing;
```

## A prova para o quadro

```bash
npm run web:e2e:report
```

O relatório HTML traz screenshot de cada rota conferida, com data. É o que o
quadro exige para mover card a `no_ar_verificado` — mergeado não é verificado.

## Rotas dinâmicas

`coletarRotas` pulava `[id]` por precisar de um id que existisse, e o efeito era
que a suíte cobria as **listas** e ignorava os **detalhes** — editor de página,
campanha, cliente no `/admin`. Exatamente as telas onde o produto acontece
(achado de 21/08/2026).

Agora `rotas.ts` também varre os **padrões** dinâmicos, e
`fixtures-dinamicas.ts` diz como transformar cada padrão num id real: o registro
é criado pela API do próprio app, com a sessão do usuário de QA, então não há
como nascer no tenant errado.

Duas regras que fazem o mecanismo valer alguma coisa:

- **Contraste obrigatório.** Cada rota é aberta duas vezes — com o id do fixture
  e com um id que não existe — e o teste exige respostas **diferentes**. Sem
  isso, uma tela que ignora o parâmetro daria o mesmo verde (a armadilha de
  17/08: duas causas para a mesma resposta).
- **Padrão novo sem fixture quebra a suíte.** Há um teste de completude que
  compara a varredura com o mapa de fixtures. Tela dinâmica futura aparece
  sozinha e *cobra* cobertura, em vez de nascer sem ela — que foi como este
  buraco surgiu.

`/admin/tenants/[id]` é cobertura de **gate**, não de renderização, pelo mesmo
motivo das estáticas de `/admin`: o usuário de QA é lojista comum, e promovê-lo
quebraria os seis testes H1 de `seguranca-impersonation.spec.ts`.

## Fora do smoke de propósito

- **Entrega de e-mail**: depende de caixa externa e deixaria a suíte instável.
  Desde o #112 a entrega vira linha em `public.logs`, conferível por SQL.
- **Entrega real de mensagem**: nenhum spec constrói `EvolutionSender`.
