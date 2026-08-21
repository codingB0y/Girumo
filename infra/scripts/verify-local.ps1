$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")

# Este script roda em dois lugares: na maquina do dev (Windows PowerShell 5.1) e
# no CI (pwsh no Linux). O que muda entre eles e so o nome dos executaveis — e o
# fato de -ExecutionPolicy nao existir fora do Windows.
$isCore = $PSVersionTable.PSEdition -eq "Core"
$psExe = if ($isCore) { "pwsh" } else { "powershell" }
# [string[]] nao e decorativo: um array de UM elemento devolvido por `if` e
# desembrulhado para String, e ai `& $psExe @psArgs` splata a string caractere a
# caractere — o pwsh recebe "-", "F", "i"... e morre com exit 64 ("The argument
# 'F' is not recognized as the name of a script file"). O ramo Windows tem tres
# elementos e sobrevive por acidente; so o ramo Core, de um elemento, quebrava.
[string[]] $psArgs = if ($isCore) { @("-File") } else { @("-ExecutionPolicy", "Bypass", "-File") }
$npmExe = if ($isCore) { "npm" } else { "npm.cmd" }

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
  & $psExe @psArgs infra/scripts/check-env-template.ps1 -Path deploy/vercel/.env.production.example -Profile vercel
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $psExe @psArgs infra/scripts/check-env-template.ps1 -Path deploy/coolify/.env.example -Profile coolify
}

Invoke-NativeStep "Scan de secrets" {
  & $psExe @psArgs infra/scripts/scan-secrets.ps1
}

Invoke-NativeStep "Testes" {
  & $npmExe test
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  & $npmExe run engine:test
}

Invoke-NativeStep "TypeScript web" {
  & $npmExe --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
}

# O tsconfig do build ignora `e2e/**` e `playwright.config.ts` desde o incidente
# de 21/08/2026 (import de teste sem dependencia declarada derrubou o deploy de
# producao por ~4h). Sem este passo esses arquivos nao seriam checados em lugar
# nenhum, e a correcao teria aberto um buraco novo.
Invoke-NativeStep "TypeScript E2E" {
  & $npmExe --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json
}

Invoke-NativeStep "Build web" {
  & $npmExe --workspace apps/web run build
}

Invoke-NativeStep "Sintaxe engine" {
  node --check hubflow-engine/index.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node --check hubflow-engine/queues/supabase-command-worker.js
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  node --check hubflow-engine/config/env.js
}

Write-Host "Verificacao local concluida com sucesso."
