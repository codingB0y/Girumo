param(
  [Parameter(Mandatory = $true)]
  [string] $DatabaseUrl
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$files = @(
  "infra\migrations\202606240001_base_schema.sql",
  "infra\rls\202606240002_rls_policies.sql",
  "infra\seeds\202606240003_seed_plans.sql",
  "infra\rls\202606240004_storage_policies.sql",
  "infra\migrations\202606240005_engine_rpc.sql",
  "infra\migrations\202606240006_membership_invites.sql"
)

foreach ($file in $files) {
  $path = Join-Path $root $file
  if (-not (Test-Path $path)) {
    throw "Arquivo SQL nao encontrado: $file"
  }

  Write-Host "Aplicando $file"
  psql $DatabaseUrl -v ON_ERROR_STOP=1 -f $path
}

Write-Host "SQL Supabase aplicado com sucesso."
