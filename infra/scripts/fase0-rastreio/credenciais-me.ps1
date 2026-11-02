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

$colado = Ler-Segredo 'Cole o endereco da barra do navegador'
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
