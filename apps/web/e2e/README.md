# Smoke E2E do painel

Nasceu de 19/08/2026: dois bugs sérios (#114 componente órfão, #115 comando
preso na fila) passaram por CI, teste unitário e revisão. Só apareceram no uso
real.

## O que cada arquivo prova — e o que não prova

| Arquivo | Precisa de login | Prova |
|---|---|---|
| `auth.setup.ts` | — | Loga uma vez e grava a sessão para os demais reusarem |
| `auth-gate.spec.ts` | não | Nenhuma rota do painel abre sem sessão |
| `painel-rotas.spec.ts` | sim | Cada rota existe, renderiza e monta o shell |
| `equipe-convite.spec.ts` | sim | Convidar → aparece → revogar → some |
| `sessao.spec.ts` | sim | Logout derruba o acesso |

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

Sem `E2E_EMAIL`/`E2E_PASSWORD` só o `auth-gate` roda; o resto aparece como
skipped, não como falha. Para a suíte inteira, use um usuário do Supabase de
**dev** — `qa-user@girumo.test` já existe lá, criado por
`npm run qa:prepare-brand`:

```powershell
$env:E2E_EMAIL = "usuario@dev"; $env:E2E_PASSWORD = "senha"; npm run web:e2e
```

O dev server sobe sozinho (`reuseExistingServer`). Contra outro alvo:
`$env:E2E_BASE_URL = "http://localhost:3000"`.

## No CI

Roda como o job `e2e` do workflow `Verify`, em todo PR e todo push para `main`.
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

Faltando `E2E_SUPABASE_URL` ou `E2E_EMAIL`, o job se **pula com aviso** no
summary em vez de ficar vermelho: PR de fork não enxerga segredo, e CI vermelho
por falta de segredo é como o time aprende a ignorar a suíte.

O relatório HTML sobe como artefato `e2e-report` (14 dias) mesmo quando a suíte
falha — sem isso, falha no CI vira "deu vermelho" sem screenshot de nada.

**Não roda contra preview da Vercel**: preview não recebe env de Supabase, então
não existe login lá (achado de 11/08).

## A prova para o quadro

```bash
npm run web:e2e:report
```

O relatório HTML traz screenshot de cada rota conferida, com data. É o que o
quadro exige para mover card a `no_ar_verificado` — mergeado não é verificado.

## Fora do smoke de propósito

- **Cadeia de automação** (gatilho → Evolution → WhatsApp): a automação
  "Grupo lotou" está ligada e o grupo real está em 1022/1024. Disparar
  `group_full` mandaria mensagem para 1024 clientes. Precisa de tenant isolado.
- **Entrega de e-mail**: depende de caixa externa e deixaria a suíte instável.
  Desde o #112 a entrega vira linha em `public.logs`, conferível por SQL.
- **Rotas dinâmicas** (`[slug]`, `[id]`): precisam de registro que exista.
