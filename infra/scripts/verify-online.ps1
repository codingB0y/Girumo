param(
  [Parameter(Mandatory = $true)]
  [string] $AppUrl,

  [Parameter(Mandatory = $false)]
  [string] $EngineUrl,

  [Parameter(Mandatory = $false)]
  [switch] $SkipPublicPages
)

$ErrorActionPreference = "Stop"

function Normalize-Url {
  param([Parameter(Mandatory = $true)][string] $Url)
  return $Url.TrimEnd("/")
}

function Read-JsonEndpoint {
  param([Parameter(Mandatory = $true)][string] $Url)

  try {
    return Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 20
  } catch {
    $body = ""
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $body = " Body: $($_.ErrorDetails.Message)"
    }
    throw "Falha ao consultar $Url. $($_.Exception.Message)$body"
  }
}

function Read-Page {
  param([Parameter(Mandatory = $true)][string] $Url)

  try {
    return Invoke-WebRequest -Method Get -Uri $Url -TimeoutSec 20 -MaximumRedirection 5
  } catch {
    throw "Falha ao abrir pagina $Url. $($_.Exception.Message)"
  }
}

function Assert-PageOk {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Url,
    [Parameter(Mandatory = $true)]
    [string] $Name
  )

  Write-Host "==> Validando pagina publica: $Name ($Url)"
  $response = Read-Page $Url

  if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 400) {
    throw "Pagina publica $Name retornou status $($response.StatusCode)."
  }

  return $response
}

$app = Normalize-Url $AppUrl
$appHealthUrl = "$app/api/health"

Write-Host "==> Validando app web: $appHealthUrl"
$appHealth = Read-JsonEndpoint $appHealthUrl

if ($appHealth.service -ne "hubflow-web") {
  throw "Resposta inesperada do app web. service=$($appHealth.service)"
}

if ($appHealth.status -ne "ok") {
  $checks = $appHealth.checks | ConvertTo-Json -Depth 8
  throw "App web esta degraded. Checks: $checks"
}

Write-Host "App web OK."

if (-not $SkipPublicPages) {
  $landing = Assert-PageOk "$app/" "landing"
  Assert-PageOk "$app/login" "login" | Out-Null
  Assert-PageOk "$app/signup" "signup" | Out-Null
  Assert-PageOk "$app/forgot-password" "recuperacao de senha" | Out-Null

  if ($landing.Content -match "DevZap|DevZapp|VIP Growth OS|5511999999999") {
    throw "Landing contem marca, slogan ou telefone legado."
  }

  if ($landing.Content -notmatch "GIRUMO") {
    throw "Landing nao contem a marca GIRUMO."
  }

  Write-Host "Paginas publicas OK."
}

if ($EngineUrl) {
  $engine = Normalize-Url $EngineUrl
  $engineHealthUrl = "$engine/health"

  Write-Host "==> Validando engine: $engineHealthUrl"
  $engineHealth = Read-JsonEndpoint $engineHealthUrl

  if ($engineHealth.service -ne "hubflow-engine") {
    throw "Resposta inesperada da engine. service=$($engineHealth.service)"
  }

  if ($engineHealth.ok -ne $true) {
    $checks = $engineHealth | ConvertTo-Json -Depth 8
    throw "Engine nao esta ok. Health: $checks"
  }

  Write-Host "Engine OK."
}

Write-Host "Verificacao online concluida com sucesso."
