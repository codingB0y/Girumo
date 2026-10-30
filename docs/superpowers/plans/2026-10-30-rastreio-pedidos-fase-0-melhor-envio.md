# Rastreio do pedido — Fase 0, prova 5: o Melhor Envio enxerga as etiquetas da piloto? (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Antes de escrever o PR 8, saber se o app da Girumo no Melhor Envio enxerga as etiquetas da loja-piloto e
acha cada uma pelo código de rastreio que a Yampi guarda — contando só, sem gravar dado de cliente.

**Architecture:** Um `.ps1` na janela do Igor faz a autorização OAuth (só leitura) e deixa o token só no ambiente da
janela. Um `.mjs` lê da Yampi os códigos dos pedidos criados há 45–15 dias, lista as etiquetas da conta do Melhor
Envio, cruza em memória e imprime só contagens e nomes de campo, já no formato das linhas do resultado. A lógica de
cruzar e o veredito moram num módulo puro, com teste.

**Tech Stack:** Node 24 (`fetch`, `node:test`), Windows PowerShell 5.1, API do Melhor Envio v2 e API da Yampi
(`api.dooki.com.br/v2`).

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` §10 (prova 5), §1.1 (marcos do Melhor Envio)
e §3.6. **Índice:** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md`.

## Global Constraints

- **Nenhum dado de cliente sai da memória.** A saída e o resultado só têm contagens e nomes de campo: nenhum código de
  rastreio, nome, documento, endereço ou e-mail. Os pedidos são buscados sem `include` (só `created_at` e
  `track_code` interessam) e descartados depois do cruzamento.
- **Credencial só no ambiente da janela do Igor**, digitada sem eco: `YAMPI_ALIAS`, `YAMPI_USER_TOKEN`,
  `YAMPI_USER_SECRET_KEY` (os mesmos nomes do `credenciais.ps1` do Recuperar), `MELHORENVIO_CLIENT_ID` e
  `MELHORENVIO_TOKEN`. O `client_secret` vive só numa variável do script e morre com ele; o `refresh_token` é
  descartado; o token nunca é impresso. Nada em arquivo, comando, chat ou commit.
- **Escopos só de leitura:** `orders-read` ("Visualização das etiquetas") e `shipping-tracking` ("status do ciclo de
  vida das etiquetas").
- **Callback fixo, o mesmo do PR 8:** `https://www.girumo.com.br/api/integracoes/melhor-envio/retorno`. O Melhor Envio
  exige callback idêntico ao cadastrado no app (senão responde `Client invalid`). A rota ainda não existe: o navegador
  mostra erro e o endereço com `code` e `state` fica na barra, que é o que o Igor cola. O `code` passa pelo log da
  Vercel, mas é de uso único e não vale nada sem o `client_secret`.
- **Endpoints** (doc oficial e SDK `melhorenvio/auth-sdk-php`, conferidos em 30/10):
  - `https://melhorenvio.com.br/oauth/authorize` — `client_id`, `redirect_uri`, `response_type=code`, `state`, `scope`
    separado por espaço;
  - `POST https://melhorenvio.com.br/oauth/token` — formulário com `grant_type=authorization_code`, `client_id`,
    `client_secret`, `redirect_uri` e `code`;
  - `GET https://melhorenvio.com.br/api/v2/me/orders?page=N` — paginado (`current_page`, `last_page`, `per_page`,
    `total`, `data`);
  - `GET https://melhorenvio.com.br/api/v2/me/orders/search?q=<código>` — procura em `id`, `protocol`, documento,
    `tracking` e `authorization_code`, **não** em `self_tracking`; 400 `Not Found` quando não acha;
  - cabeçalhos: `Accept: application/json`, `Authorization: Bearer <token>` e
    `User-Agent: Girumo (contato@girumo.com.br)`.
- **Yampi:** `GET https://api.dooki.com.br/v2/{alias}/orders?limit=100&page=N`, com `User-Token` e `User-Secret-Key`,
  até 12 páginas (`meta.pagination.total_pages`). O filtro de data é o da variante que a linha Y22 do Recuperar
  escolheu: `plana` = `date=created_at:<início>|<fim>`, `filters` = `filters[date]=…`, ou `sem-filtro`.
- **Ritmo:** Melhor Envio com 300 ms entre chamadas (até 200 por minuto; o limite é 250 por minuto por usuário); Yampi
  com 1,1 s, como as ferramentas do Recuperar. Um 429 espera 60 s e tenta uma vez.
- **Independente das ferramentas do Recuperar:** pasta própria `infra/scripts/fase0-rastreio/`, sem importar nada de
  `fase0-recuperar/`. Na janela onde o `credenciais.ps1` do Recuperar já rodou, o `.ps1` daqui não pede a Yampi de
  novo.
- Fora do `npm test`. Apagar a pasta quando o PR 8 estiver no ar, ou quando o Igor decidir que ele não anda.
- PowerShell 5.1 (sem `&&`/`||`); `.ps1` só em ASCII. Commit em inglês, com prefixo semântico e a linha
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **O código da Yampi está no `self_tracking`, não no `tracking`:** a busca não acha, então o cruzamento usa também o
   índice da lista. Teste da Task 1, "acha pelo tracking e pelo self_tracking".
2. **Vazamento na saída:** nenhum código, nome, documento ou texto livre de etiqueta sai no resumo. Teste da Task 1,
   "o resumo das etiquetas só tem contagens e nomes de campo".
3. **O mesmo código escrito diferente** (minúscula, espaço) e pedido repetido: um código só. Testes da Task 1.
4. **Conta grande:** a lista de etiquetas para por página (`last_page`), por data (etiqueta criada há mais de 75 dias)
   ou no teto de 60 páginas; a linha M2 diz até onde chegou, para saber se a janela foi coberta.
5. **Token recusado ou vencido no meio (401) e limite (429):** para com uma mensagem só com o status, nunca com o
   corpo da resposta. Conferido no Step 4 da Task 2, sem credencial.

## Antes de começar

- Worktree novo a partir de `origin/main` (branch `feat/rastreio-fase0-melhor-envio`).
- **O Igor, dias antes**, porque a verificação demora:
  1. no Melhor Envio da Girumo, verificar a conta (pessoa física, documento e selfie), que a produção exige;
  2. em Integrações › Área Dev, criar o app "Girumo" com o callback exato acima e o e-mail técnico
     `contato@girumo.com.br`;
  3. guardar o Client ID e o Client Secret só com ele (não mandar para a sessão);
  4. combinar com quem tem a conta do Melhor Envio da piloto o momento de autorizar o app.

## Arquivos

```
infra/scripts/fase0-rastreio/
  cruzar.mjs           puro: janela da Yampi, índice das etiquetas, cruzamento, resumo, veredito, linhas do resultado
  cruzar.test.mjs      node:test
  melhor-envio.mjs     CLI: ping | medir [plana|filters|sem-filtro]
  credenciais-me.ps1   autorização OAuth na janela do Igor
docs/superpowers/plans/_rastreio-fase-0-resultado.md     (Task 3; só contagens)
```

### Task 1: Módulo puro `cruzar.mjs`

**Files:**
- Create: `infra/scripts/fase0-rastreio/cruzar.mjs`
- Test: `infra/scripts/fase0-rastreio/cruzar.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `normalizarCodigo(v: unknown): string | null` — tira espaços e põe em maiúsculas; vazio ou não-texto → `null`.
  - `codigosEnviadosNaJanela(pedidos: object[], agora: number)` → `{ codigos: string[]; inicio; fim; baixados;
    semData; naJanela; comCodigo; maisAntigo; maisNovo }`. A janela é a mesma da Y22: o dia de `created_at` (texto ou
    `{ date }`) entre agora − 45 e agora − 15 dias, inclusive. `codigos` sem repetição.
  - `indexar(etiquetas: object[]): Map<string, "tracking" | "self_tracking">` — o `tracking` vence quando o mesmo
    código aparece nos dois campos.
  - `cruzar(codigos: string[], indice)` → `{ achadasTracking: number; achadasSelf: number; faltando: string[] }`.
    `faltando` só fica em memória: a CLI busca esses códigos e conta.
  - `resumirEtiquetas(etiquetas: object[])` → `{ listadas; porStatus; datasPorStatus; chaves; chavesEmProblema;
    maisAntiga }`. `datasPorStatus[status][campo]` conta as etiquetas daquele status com o campo `*_at` preenchido;
    `chaves` são os nomes de primeiro nível vistos; `chavesEmProblema`, os nomes de primeiro nível preenchidos nas
    etiquetas `paused`, `undelivered` e `suspended`; `maisAntiga` é o menor dia de `created_at`.
  - `veredito({ codigos, achadas, listadas }): "PASSA" | "DECIDIR" | "NAO_PASSA" | "SEM_CODIGOS"`.
  - `linhasDoResultado(m): string` — as linhas M1 a M7 da tabela do resultado (texto no Step 3).

- [ ] **Step 1: Escrever os testes que falham**

```js
// infra/scripts/fase0-rastreio/cruzar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { codigosEnviadosNaJanela, cruzar, indexar, linhasDoResultado, normalizarCodigo, resumirEtiquetas, veredito } from "./cruzar.mjs";

const AGORA = Date.parse("2026-11-20T12:00:00Z"); // janela: 2026-10-06 a 2026-11-05
const pedido = (dia, track_code) => ({ created_at: { date: `${dia} 10:00:00.000000`, timezone: "America/Sao_Paulo" }, track_code });

test("normaliza caixa e espaços; vazio vira null", () => {
  assert.equal(normalizarCodigo(" aa 123456789br "), "AA123456789BR");
  assert.equal(normalizarCodigo(""), null);
  assert.equal(normalizarCodigo(null), null);
});

test("só códigos de pedidos criados na janela de 45 a 15 dias, sem repetir", () => {
  const r = codigosEnviadosNaJanela([
    pedido("2026-10-06", "AA111111111BR"), // primeiro dia da janela
    pedido("2026-11-05", "aa111111111br"), // último dia, mesmo código
    pedido("2026-11-06", "AA222222222BR"), // depois da janela
    pedido("2026-10-05", "AA333333333BR"), // antes da janela
    pedido("2026-10-20", null), // na janela, sem código
    { track_code: "AA444444444BR" }, // sem data
  ], AGORA);
  assert.deepEqual(r.codigos, ["AA111111111BR"]);
  assert.deepEqual([r.inicio, r.fim], ["2026-10-06", "2026-11-05"]);
  assert.deepEqual([r.baixados, r.semData, r.naJanela, r.comCodigo], [6, 1, 3, 2]);
  assert.deepEqual([r.maisAntigo, r.maisNovo], ["2026-10-05", "2026-11-06"]);
});

test("acha pelo tracking e pelo self_tracking; o resto fica faltando", () => {
  const indice = indexar([
    { tracking: "AA111111111BR", self_tracking: null },
    { tracking: "ME2211111", self_tracking: "aa222222222br" },
  ]);
  const r = cruzar(["AA111111111BR", "AA222222222BR", "AA999999999BR"], indice);
  assert.deepEqual([r.achadasTracking, r.achadasSelf], [1, 1]);
  assert.deepEqual(r.faltando, ["AA999999999BR"]);
});

test("o resumo das etiquetas só tem contagens e nomes de campo, nunca valores", () => {
  const r = resumirEtiquetas([
    { status: "delivered", tracking: "AA111111111BR", to: { name: "Fulana Teste", document: "11144477735" }, created_at: "2026-10-10 09:00:00", posted_at: "2026-10-11 09:00:00", delivered_at: "2026-10-14 15:00:00", paused_at: null },
    { status: "paused", tracking: "AA222222222BR", to: { name: "Beltrana" }, created_at: "2026-10-12 09:00:00", posted_at: "2026-10-13 09:00:00", motivo_inventado: "Destinatario ausente" },
  ]);
  assert.equal(r.listadas, 2);
  assert.deepEqual(r.porStatus, { delivered: 1, paused: 1 });
  assert.deepEqual(r.datasPorStatus.delivered, { created_at: 1, posted_at: 1, delivered_at: 1 });
  assert.ok(r.chavesEmProblema.includes("motivo_inventado"));
  assert.equal(r.maisAntiga, "2026-10-10");
  const texto = JSON.stringify(r);
  for (const valor of ["Fulana", "Beltrana", "11144477735", "AA111111111BR", "Destinatario"]) assert.ok(!texto.includes(valor), valor);
});

test("veredito: 80% ou mais passa; nenhuma achada não passa; entre os dois, o Igor decide", () => {
  assert.equal(veredito({ codigos: 10, achadas: 8, listadas: 50 }), "PASSA");
  assert.equal(veredito({ codigos: 10, achadas: 7, listadas: 50 }), "DECIDIR");
  assert.equal(veredito({ codigos: 10, achadas: 0, listadas: 50 }), "NAO_PASSA");
  assert.equal(veredito({ codigos: 10, achadas: 0, listadas: 0 }), "NAO_PASSA");
  assert.equal(veredito({ codigos: 0, achadas: 0, listadas: 50 }), "SEM_CODIGOS");
});

test("as linhas do resultado levam a cobertura e o veredito", () => {
  const texto = linhasDoResultado({
    variante: "plana", inicio: "2026-10-06", fim: "2026-11-05", baixados: 120, semData: 0, naJanela: 40, comCodigo: 12,
    maisAntigo: "2026-10-06", maisNovo: "2026-11-05", codigos: 10, listadas: 50, paginas: 4, maisAntiga: "2026-08-30",
    achadasTracking: 7, achadasSelf: 1, achadasNaBusca: 0, buscados: 2, porStatus: { delivered: 30, posted: 20 },
    datasPorStatus: { delivered: { delivered_at: 30 } }, chavesEmProblema: [], veredito: "PASSA",
  });
  assert.match(texto, /\| M3 \| Códigos da Yampi achados no Melhor Envio \| 8 de 10 \(80%\)/);
  assert.match(texto, /\| M7 \| Veredito da prova 5 \| PASSA \|/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test infra/scripts/fase0-rastreio/cruzar.test.mjs`
Expected: FAIL com `ERR_MODULE_NOT_FOUND` (`cruzar.mjs`).

- [ ] **Step 3: Implementar `cruzar.mjs`**

Funções do bloco **Interfaces**, sem importar nada (só JavaScript puro). Datas: o dia é o `AAAA-MM-DD` do começo do
texto, ou do `date` quando vier objeto (o formato que o Recuperar viu na Yampi); os dias da janela saem de
`new Date(agora - n * 864e5).toISOString().slice(0, 10)`. `veredito`: `codigos === 0` → `SEM_CODIGOS`;
`listadas === 0` ou `achadas === 0` → `NAO_PASSA`; `achadas / codigos >= 0.8` → `PASSA`; senão `DECIDIR`.

`linhasDoResultado(m)` devolve exatamente estas linhas (`{x}` = campo de `m`; `{pct}` =
`Math.round(100 * achadas / codigos)`, com `achadas = achadasTracking + achadasSelf + achadasNaBusca`; listas como
`` `chave`=n `` separadas por vírgula; lista vazia = `—`):

```
| M1 | Pedidos da Yampi criados de {inicio} a {fim} (variante {variante}) | {naJanela} na janela, {comCodigo} com código, {codigos} códigos únicos; {baixados} baixados, de {maisAntigo} a {maisNovo}; {semData} sem data |
| M2 | Etiquetas que o app da Girumo lista na conta da piloto | {listadas} em {paginas} página(s); a mais antiga de {maisAntiga} |
| M3 | Códigos da Yampi achados no Melhor Envio | {achadas} de {codigos} ({pct}%): {achadasTracking} pelo `tracking`, {achadasSelf} pelo `self_tracking`, {achadasNaBusca} só pela busca ({buscados} buscados) |
| M4 | Status das etiquetas listadas | {porStatus} |
| M5 | Campos de data preenchidos, por status | {status}: {datasPorStatus[status]}; … |
| M6 | Campos preenchidos nas etiquetas `paused`, `undelivered` e `suspended` | {chavesEmProblema} |
| M7 | Veredito da prova 5 | {veredito} |
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test infra/scripts/fase0-rastreio/cruzar.test.mjs`
Expected: PASS nos 6 testes. Mutantes que têm de cair (rodar e desfazer com `git checkout --`): `indexar` sem o
`self_tracking` → cai "acha pelo tracking e pelo self_tracking"; `resumirEtiquetas` copiando os valores de primeiro
nível → cai "o resumo das etiquetas só tem contagens".

- [ ] **Step 5: Commit**

```powershell
git add infra/scripts/fase0-rastreio/cruzar.mjs infra/scripts/fase0-rastreio/cruzar.test.mjs
git commit -m "chore(rastreio): phase 0 proof 5 matching module" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: A autorização (`credenciais-me.ps1`) e a CLI (`melhor-envio.mjs`)

**Files:**
- Create: `infra/scripts/fase0-rastreio/credenciais-me.ps1`
- Create: `infra/scripts/fase0-rastreio/melhor-envio.mjs`

**Interfaces:**
- Consumes: tudo de `cruzar.mjs` (Task 1).
- Produces: `MELHORENVIO_TOKEN` no ambiente da janela; os comandos `ping` e `medir [plana|filters|sem-filtro]`, que
  imprimem só contagens e nomes de campo.

- [ ] **Step 1: Escrever o `.ps1`** (só ASCII; o texto é este, porque decide onde o segredo passa)

```powershell
# infra/scripts/fase0-rastreio/credenciais-me.ps1
# Prova 5 do Rastreio. Rode NA JANELA DO IGOR (nunca por ferramenta do Claude).
# Pede sem eco o que falta, abre a autorizacao do Melhor Envio, troca o codigo pelo token e guarda o token
# so no ambiente desta janela. Nada vai para arquivo nem para a tela; o refresh_token e descartado.
# ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI.
#   & .\infra\scripts\fase0-rastreio\credenciais-me.ps1
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Web
$retorno = 'https://www.girumo.com.br/api/integracoes/melhor-envio/retorno'

function Ler-Texto([string]$Pergunta) {
  $texto = Read-Host -Prompt $Pergunta
  if ([string]::IsNullOrWhiteSpace($texto)) { throw 'vazio' }
  return $texto.Trim()
}
function Ler-Segredo([string]$Pergunta) {
  $seguro = Read-Host -Prompt $Pergunta -AsSecureString
  $texto = [System.Net.NetworkCredential]::new('', $seguro).Password
  if ([string]::IsNullOrWhiteSpace($texto)) { throw 'vazio' }
  return $texto.Trim()
}

if (-not $env:YAMPI_ALIAS) {
  $env:YAMPI_ALIAS = Ler-Texto 'YAMPI_ALIAS (alias da loja piloto)'
  $env:YAMPI_USER_TOKEN = Ler-Segredo 'YAMPI_USER_TOKEN (Yampi > Perfil > Credenciais de API)'
  $env:YAMPI_USER_SECRET_KEY = Ler-Segredo 'YAMPI_USER_SECRET_KEY (idem)'
}
$env:MELHORENVIO_CLIENT_ID = Ler-Texto 'MELHORENVIO_CLIENT_ID (Melhor Envio > Integracoes > Area Dev > app Girumo)'
$segredo = Ler-Segredo 'MELHORENVIO_CLIENT_SECRET (idem)'
if (-not $env:MELHORENVIO_USER_AGENT) { $env:MELHORENVIO_USER_AGENT = 'Girumo (contato@girumo.com.br)' }

$estado = [guid]::NewGuid().ToString('N')
$autorizar = 'https://melhorenvio.com.br/oauth/authorize?client_id=' + [uri]::EscapeDataString($env:MELHORENVIO_CLIENT_ID) +
  '&redirect_uri=' + [uri]::EscapeDataString($retorno) + '&response_type=code&state=' + $estado +
  '&scope=' + [uri]::EscapeDataString('orders-read shipping-tracking')
'Abrindo o navegador. Entre com a conta do Melhor Envio DA LOJA PILOTO e autorize o app Girumo.'
'Depois a pagina da Girumo mostra um erro: e normal. Copie o endereco inteiro da barra do navegador.'
Start-Process $autorizar

$volta = [uri](Ler-Segredo 'Cole o endereco da barra do navegador')
$q = [System.Web.HttpUtility]::ParseQueryString($volta.Query)
if ($q['state'] -ne $estado) { throw 'state nao confere: rode o script de novo' }
if (-not $q['code']) { throw 'endereco sem code: a autorizacao foi recusada?' }

$pedido = @{
  Method = 'Post'; Uri = 'https://melhorenvio.com.br/oauth/token'; UserAgent = $env:MELHORENVIO_USER_AGENT
  Headers = @{ Accept = 'application/json' }; ContentType = 'application/x-www-form-urlencoded'
  Body = @{ grant_type = 'authorization_code'; client_id = $env:MELHORENVIO_CLIENT_ID; client_secret = $segredo; redirect_uri = $retorno; code = $q['code'] }
}
$r = Invoke-RestMethod @pedido
$env:MELHORENVIO_TOKEN = $r.access_token
'MELHORENVIO_TOKEN {0} caracteres; vence em {1} dias' -f $env:MELHORENVIO_TOKEN.Length, [math]::Round($r.expires_in / 86400)
```

- [ ] **Step 2: Escrever a CLI `melhor-envio.mjs`**

Cabeçalho com o uso (`ping | medir [plana|filters|sem-filtro]`), `pedirEnv(nome)` local (lança
`` `${nome} ausente no ambiente (rode credenciais-me.ps1 na janela do Igor).` ``) e uma função `chamar(url, headers,
pausaMs)`: `fetch` com `AbortSignal.timeout(20_000)`, a pausa depois de cada chamada, 429 espera 60 s e tenta uma vez,
devolve só `{ status, json }`. Quem chama nunca imprime corpo: erro vira `"<Yampi|Melhor Envio> respondeu http=<n>."`,
e o 401 vira `"... recusou a credencial (401): refaça credenciais-me.ps1."`.

- `ping`: `GET /api/v2/me/orders?page=1` → `ping http=200 total=… per_page=… last_page=… nesta_pagina=… chaves=[…]`
  (as chaves pelo `resumirEtiquetas` da primeira página).
- `medir [variante]` (padrão `plana`):
  1. Yampi, até 12 páginas de 100, com o filtro da variante para `created_at:<agora-45d>|<agora-15d>` →
     `codigosEnviadosNaJanela(pedidos, agora)`; esvaziar a lista de pedidos logo depois.
  2. Melhor Envio, `GET /orders?page=N` a partir de 1; para quando `N >= last_page`, quando a etiqueta mais antiga da
     página for de antes de agora − 75 dias, ou na página 60 → `resumirEtiquetas(todas)` e
     `cruzar(codigos, indexar(todas))`; esvaziar as etiquetas logo depois.
  3. Para até 50 códigos de `faltando`: `GET /orders/search?q=<código>`; 200 com lista não vazia conta em
     `achadasNaBusca`, 400 é "não achou", 401 para.
  4. `veredito(...)` e `console.log(linhasDoResultado(m))`. Nada é gravado em arquivo.
- Ponto de entrada no molde do `yampi.mjs` do Recuperar: comando desconhecido → uso e `exit 2`; erro → `erro: <mensagem>`
  e `exit 1`.

- [ ] **Step 3: Conferir sintaxe, uso e o `.ps1`**

```powershell
node --check infra/scripts/fase0-rastreio/melhor-envio.mjs
node infra/scripts/fase0-rastreio/melhor-envio.mjs
node infra/scripts/fase0-rastreio/melhor-envio.mjs medir
$erros = $null
[System.Management.Automation.Language.Parser]::ParseFile("$PWD\infra\scripts\fase0-rastreio\credenciais-me.ps1", [ref]$null, [ref]$erros) | Out-Null
"erros de sintaxe no .ps1: $($erros.Count)"
"bytes nao-ASCII no .ps1: $(@([System.IO.File]::ReadAllBytes("$PWD\infra\scripts\fase0-rastreio\credenciais-me.ps1") | Where-Object { $_ -gt 127 }).Count)"
```

Expected: `--check` sem saída; `uso: melhor-envio.mjs ping | medir [plana|filters|sem-filtro]`;
`erro: YAMPI_ALIAS ausente no ambiente (rode credenciais-me.ps1 na janela do Igor).`; `erros de sintaxe no .ps1: 0`;
`bytes nao-ASCII no .ps1: 0`.

- [ ] **Step 4: Revisão de segurança antes de tocar em dado real**

Agente Security Engineer sobre os quatro arquivos, com esta pergunta: algum caminho imprime, grava ou devolve token,
segredo, código de rastreio ou dado de etiqueta e de pedido? Achado CRITICAL ou HIGH → corrigir com teste antes de
seguir.

- [ ] **Step 5: Commit e PR das ferramentas**

```powershell
git add infra/scripts/fase0-rastreio
git diff --cached --stat
git commit -m "chore(rastreio): phase 0 proof 5 tools (Melhor Envio visibility)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

PR só com a pasta (CI verde → merge → apagar a branch), antes da prova ao vivo.

### Task 3: Prova ao vivo (com o Igor) e resultado

Os comandos rodam na janela do Igor (`$wt` = o worktree, como no Recuperar). A sessão lê a saída com `read_terminal`:
ela só tem contagens.

- [ ] **Step 1: Autorizar** — `& .\infra\scripts\fase0-rastreio\credenciais-me.ps1`, entrando com a conta do Melhor
  Envio **da piloto**. Expected: `MELHORENVIO_TOKEN <n> caracteres; vence em 30 dias`. `Client invalid` = o callback
  do app não é idêntico ao do Global Constraints: corrigir na Área Dev e rodar de novo.
- [ ] **Step 2: Ping** — `node infra/scripts/fase0-rastreio/melhor-envio.mjs ping`. Expected: `ping http=200 …`. 401
  → refazer o Step 1. `total=0` → o app não enxerga etiqueta nenhuma: anotar e seguir para o Step 3 assim mesmo (o
  veredito sai `NAO_PASSA`).
- [ ] **Step 3: Medir** — `node infra/scripts/fase0-rastreio/melhor-envio.mjs medir <variante>`, com a variante que a
  Y22 escolheu (sem a Y22 ainda, `plana`). Se M1 mostrar `maisAntigo` depois do `inicio`, a variante não cobriu a
  janela: rodar com a próxima (`filters`, depois `sem-filtro`).
- [ ] **Step 4: O que o `paused` cobre** — se M4 tiver `paused` ou `undelivered`, o Igor abre uma dessas etiquetas no
  painel do Melhor Envio e diz, sem nome nem endereço, o motivo que o painel mostra. A sessão anota em M6 só a
  categoria (exemplo: "aguardando retirada na agência", "destinatário ausente").
- [ ] **Step 5: Resultado** — a sessão cria `docs/superpowers/plans/_rastreio-fase-0-resultado.md` com:
  - cabeçalho: data, "loja piloto" (sem o nome) e a variante da Yampi;
  - a tabela `| # | Pergunta | Resultado |` com as linhas M1 a M7 coladas da saída e a nota do Step 4 em M6;
  - seção "Impacto":
    - **PR 8 entra logo depois do e-mail** se a Y22 (resultado do Recuperar) for menor que 80% e M7 = `PASSA`. Com
      `DECIDIR`, o Igor decide olhando M3 e onde a piloto compra as outras etiquetas. Com `NAO_PASSA` ou
      `SEM_CODIGOS`, o PR 8 não anda: entregue e problema ficam com a lojista (ou com um serviço pago de rastreio, na
      fase 4);
    - **§3.6 do spec:** se M3 só achou pelo índice da lista, o PR 8 casa pela lista paginada; se achou pela busca,
      pode buscar código a código;
    - **§1.1 e §1.2:** M5 diz qual campo traz a data de cada marco (para a janela de 3 dias), e M6, o que o `paused`
      cobre.

  Conferir antes do commit que o arquivo não tem código de rastreio nem nome:
  `Select-String -Path docs/superpowers/plans/_rastreio-fase-0-resultado.md -Pattern '[A-Z]{2}\d{9}[A-Z]{2}'` sem
  resultado.
- [ ] **Step 6: Limpeza** — o Igor remove o acesso do app Girumo na conta do Melhor Envio da piloto e fecha a janela
  (as variáveis morrem com ela). O PR 8, se andar, pede uma autorização nova pelo fluxo de produção.
- [ ] **Step 7: Fechar** — PR de docs com o resultado (CI verde → merge → apagar a branch); `blocker` do card
  `rastreio-pedidos` com o veredito; `kg_insert_text` com a decisão do PR 8
  (`decisao-<AAAA-MM-DD>-rastreio-fase-0-melhor-envio`).

## Interface com os outros planos

- **Fase 0 do Recuperar:** a variante da Yampi e a Y22 vêm de lá
  (`docs/superpowers/plans/_recuperar-fase-0-resultado.md`). Nenhum arquivo em comum.
- **PR 8 (Melhor Envio):** o plano dele é escrito com M3 (busca × lista), M5 (campo da data) e M6 (motivos do
  `paused`); usa o mesmo app e o mesmo callback desta prova.
