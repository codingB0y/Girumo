param(
  [Parameter(Mandatory = $true)]
  [string] $AppUrl,

  [Parameter(Mandatory = $false)]
  [string] $EngineUrl
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
    throw "Falha ao consultar $Url. $($_.Exception.Message)"
  }
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
