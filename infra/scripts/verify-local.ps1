$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

function Invoke-NativeStep {
  param(
    [Parameter(Mandatory = $true)] [string] $Name,
    [Parameter(Mandatory = $true)] [scriptblock] $Command
  )

  Write-Host "==> $Name"
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "${Name} falhou: exit $LASTEXITCODE"
  }
}

Set-Location $root

Invoke-NativeStep "Validando JSON" {
  node -e "for (const f of ['package.json','apps/web/package.json','apps/web/vercel.json','hubflow-engine/package.json','hubflow-engine/package-lock.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('json ok')"
}

Invoke-NativeStep "Validando templates de ambiente" {
  powershell -ExecutionPolicy Bypass -File infra/scripts/check-env-template.ps1 -Path deploy/vercel/.env.production.example -Profile vercel
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  powershell -ExecutionPolicy Bypass -File infra/scripts/check-env-template.ps1 -Path deploy/coolify/.env.example -Profile coolify
}

Invoke-NativeStep "Scan de secrets" {
  powershell -ExecutionPolicy Bypass -File infra/scripts/scan-secrets.ps1
}

Invoke-NativeStep "Testes" {
  npm.cmd test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  npm.cmd run engine:test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node --test infra/scripts/engine-command-leases.test.js
}

Invoke-NativeStep "TypeScript web" {
  npm.cmd --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
}

Invoke-NativeStep "Build web" {
  npm.cmd --workspace apps/web run build
}

Invoke-NativeStep "Sintaxe engine" {
  node --check hubflow-engine/index.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node --check hubflow-engine/queues/supabase-command-worker.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node --check hubflow-engine/config/env.js
}

Write-Host "Verificacao local concluida com sucesso."
