param(
  [Parameter(Mandatory = $true)]
  [string] $DatabaseUrl
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$psql = Get-Command psql -ErrorAction SilentlyContinue

if (-not $psql) {
  throw @"
psql nao encontrado no PATH.

Opcoes:
1. Instale o PostgreSQL client no Windows e reabra o terminal.
   Download: https://www.postgresql.org/download/windows/

2. Ou aplique os arquivos manualmente na ordem de deploy/supabase/apply-order.txt.
"@
}

$orderFile = Join-Path $root "deploy\supabase\apply-order.txt"
if (-not (Test-Path -LiteralPath $orderFile)) {
  throw "Fonte canonica de SQL nao encontrada: $orderFile"
}

$files = @(Get-Content -LiteralPath $orderFile | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith("#") })
$duplicates = @($files | Group-Object | Where-Object { $_.Count -gt 1 })
if ($duplicates.Count -gt 0) {
  throw "Arquivos SQL duplicados em apply-order.txt: $($duplicates.Name -join ', ')"
}

foreach ($file in $files) {
  $path = Join-Path $root ($file.Replace("/", "\"))
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Arquivo SQL nao encontrado: $file"
  }

  Write-Host "Aplicando $file"
  & $psql.Source $DatabaseUrl -v ON_ERROR_STOP=1 -f $path
  if ($LASTEXITCODE -ne 0) { throw "Falha ao aplicar ${file}: exit $LASTEXITCODE" }
}

Write-Host "SQL Supabase aplicado com sucesso."
