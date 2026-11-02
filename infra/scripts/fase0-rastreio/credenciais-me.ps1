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

# Resposta vazia pergunta de novo: um Enter sobrando (de um valor colado com quebra de linha) nao derruba o script.
function Ler-Texto([string]$Pergunta) {
  do { $texto = (Read-Host -Prompt $Pergunta).Trim() } until ($texto)
  return $texto
}
function Ler-Segredo([string]$Pergunta) {
  do {
    $seguro = Read-Host -Prompt $Pergunta -AsSecureString
    $texto = [System.Net.NetworkCredential]::new('', $seguro).Password.Trim()
  } until ($texto)
  return $texto
}

# Sempre as mesmas 6 perguntas, na mesma ordem, em qualquer aba: nada depende do que a aba guardou antes.
# O alias aparece na tela: um token ou um numero colado aqui por engano e recusado. Precisa de uma letra.
$formatoAlias = '^(?=.*[a-z])[a-z0-9][a-z0-9-]*$'
do {
  $env:YAMPI_ALIAS = Ler-Texto '[1/6] Alias da loja na Yampi (ex.: minha-loja)'
  if ($env:YAMPI_ALIAS -cnotmatch $formatoAlias) { 'Isso nao parece um alias: letras minusculas, digitos e hifen.' }
} until ($env:YAMPI_ALIAS -cmatch $formatoAlias)
$env:YAMPI_USER_TOKEN = Ler-Segredo '[2/6] Token da Yampi (Yampi > Perfil > Credenciais de API)'
$env:YAMPI_USER_SECRET_KEY = Ler-Segredo '[3/6] Chave secreta da Yampi (mesma tela)'
do {
  $env:MELHORENVIO_CLIENT_ID = Ler-Texto '[4/6] Client ID do app Girumo no Melhor Envio (so numeros)'
  if ($env:MELHORENVIO_CLIENT_ID -notmatch '^\d+$') { 'O Client ID tem so numeros.' }
} until ($env:MELHORENVIO_CLIENT_ID -match '^\d+$')
$segredo = Ler-Segredo '[5/6] Client Secret do app Girumo no Melhor Envio'
if (-not $env:MELHORENVIO_USER_AGENT) { $env:MELHORENVIO_USER_AGENT = 'Girumo (contato@girumo.com.br)' }

$estado = [guid]::NewGuid().ToString('N')
$autorizar = 'https://melhorenvio.com.br/oauth/authorize?client_id=' + [uri]::EscapeDataString($env:MELHORENVIO_CLIENT_ID) +
  '&redirect_uri=' + [uri]::EscapeDataString($retorno) + '&response_type=code&state=' + $estado +
  '&scope=' + [uri]::EscapeDataString('orders-read shipping-tracking users-read')
# Janela InPrivate: sem ela, o navegador reaproveita a conta ja logada no Melhor Envio e autoriza a conta errada
# sem perguntar nada.
'Abrindo uma janela InPrivate do Edge, sem nenhuma conta logada.'
'Entre com o e-mail e a senha do Melhor Envio DA LOJA PILOTO e clique em Autorizar.'
'So depois que aparecer a pagina de erro da Girumo, copie o endereco inteiro da barra dessa janela.'
try { Start-Process msedge -ArgumentList '--inprivate', $autorizar } catch { Start-Process $autorizar }

# Espera um endereco com code=. O endereco da propria autorizacao, copiado cedo demais, pede de novo.
do {
  $colado = Ler-Segredo '[6/6] Cole o endereco da pagina de erro da Girumo (tem code= no meio)'
  if ($colado -match '[?&]error=') { throw 'o Melhor Envio recusou a autorizacao: rode o script de novo' }
  if ($colado -notmatch '[?&]code=') {
    'Esse endereco ainda nao tem code=: termine a autorizacao no navegador e copie de novo.'
  }
} until ($colado -match '[?&]code=')
try { $volta = [uri]$colado } catch { throw 'endereco invalido: rode o script de novo' }
$q = [System.Web.HttpUtility]::ParseQueryString($volta.Query)
if ($q['state'] -ne $estado) { throw 'state nao confere: rode o script de novo' }
if (-not $q['code']) { throw 'endereco sem code: a autorizacao foi recusada?' }

$pedido = @{
  Method = 'Post'; Uri = 'https://melhorenvio.com.br/oauth/token'; UserAgent = $env:MELHORENVIO_USER_AGENT
  Headers = @{ Accept = 'application/json' }; ContentType = 'application/x-www-form-urlencoded'
  Body = @{ grant_type = 'authorization_code'; client_id = $env:MELHORENVIO_CLIENT_ID; client_secret = $segredo; redirect_uri = $retorno; code = $q['code'] }
}
# Em erro, so o status: o corpo da resposta nao vai para a tela.
try { $r = Invoke-RestMethod @pedido } catch {
  $s = $null; if ($_.Exception.Response) { $s = [int]$_.Exception.Response.StatusCode }
  $Error.Clear()
  throw "token recusado (http=$s): rode o script de novo"
}
$env:MELHORENVIO_TOKEN = $r.access_token
'MELHORENVIO_TOKEN {0} caracteres; vence em {1} dias' -f $env:MELHORENVIO_TOKEN.Length, [math]::Round($r.expires_in / 86400)
