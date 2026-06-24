$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

function Run-Step {
  param(
    [Parameter(Mandatory = $true)]
    [string] $Name,
    [Parameter(Mandatory = $true)]
    [scriptblock] $Command
  )

  Write-Host "==> $Name"
  & $Command
}

Set-Location $root

Run-Step "Validando JSON" {
  node -e "for (const f of ['package.json','apps/web/package.json','hubflow-engine/package.json','hubflow-engine/package-lock.json','vercel.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('json ok')"
}

Run-Step "Validando templates de ambiente" {
  powershell -ExecutionPolicy Bypass -File infra/scripts/check-env-template.ps1 -Path deploy/vercel/.env.production.example -Profile vercel
  powershell -ExecutionPolicy Bypass -File infra/scripts/check-env-template.ps1 -Path deploy/coolify/.env.example -Profile coolify
}

Run-Step "Scan de secrets" {
  powershell -ExecutionPolicy Bypass -File infra/scripts/scan-secrets.ps1
}

Run-Step "TypeScript web" {
  Set-Location (Join-Path $root "apps\web")
  npm.cmd exec tsc -- --noEmit --project tsconfig.json
  Set-Location $root
}

Run-Step "Build web" {
  Set-Location (Join-Path $root "apps\web")
  npm.cmd run build
  Set-Location $root
}

Run-Step "Sintaxe engine" {
  Set-Location (Join-Path $root "hubflow-engine")
  node --check index.js
  node --check queues\supabase-command-worker.js
  node --check config\env.js
  Set-Location $root
}

Write-Host "Verificacao local concluida com sucesso."
