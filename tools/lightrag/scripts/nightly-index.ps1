# Indice noturno do LightRAG (perfil tech), sempre sobre origin/main.
#
# Por que existe: o `rag index` rodava do checkout principal, que fica parado numa
# branch velha (todo trabalho acontece em worktree). Em 30/09/2026 ele estava 120
# commits atras e indexava arquivo velho ou ausente; o fix #236 nunca rodou.
#
# Como: um worktree so do RAG (HubFlow-rag), resetado para origin/main a cada run.
# O codigo vem dele (PYTHONPATH); o Python, o grafo, os manifests e o .env continuam
# no checkout principal (LIGHTRAG_DATA_DIR) — nada de venv novo no C: quase cheio.
# O incremental compara hash de conteudo, entao so o que mudou gasta cota do Gemini.
#
# Uso unico (cria o worktree e agenda as 03h17):
#   powershell -ExecutionPolicy Bypass -File tools\lightrag\scripts\nightly-index.ps1 -Instalar
# Run manual:
#   powershell -ExecutionPolicy Bypass -File C:\Users\Igor\Desktop\HubFlow-rag\tools\lightrag\scripts\nightly-index.ps1

param(
    [string]$Principal = 'C:\Users\Igor\Desktop\HubFlow-platform',
    [string]$Worktree = 'C:\Users\Igor\Desktop\HubFlow-rag',
    [switch]$Instalar
)

# Continue, nao Stop: no PS 5.1 o stderr de git/python redirecionado vira erro e
# derrubaria o run no primeiro "From https://...". Falha real = exit code, conferido abaixo.
$ErrorActionPreference = 'Continue'
$dados = Join-Path $Principal 'tools\lightrag'
$python = Join-Path $dados '.venv\Scripts\python.exe'
$logDir = Join-Path $env:LOCALAPPDATA 'girumo-rag'
New-Item -ItemType Directory -Force $logDir | Out-Null

if (-not (Test-Path $Worktree)) {
    git -C $Principal fetch origin main
    if ($LASTEXITCODE -ne 0) { throw "git fetch falhou ($LASTEXITCODE)" }
    git -C $Principal worktree add --detach $Worktree origin/main
    if ($LASTEXITCODE -ne 0) { throw "git worktree add falhou ($LASTEXITCODE)" }
}

if ($Instalar) {
    $script = Join-Path $Worktree 'tools\lightrag\scripts\nightly-index.ps1'
    $acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`""
    $quando = New-ScheduledTaskTrigger -Daily -At 3:17am
    # StartWhenAvailable: PC desligado as 03h17 roda quando ligar.
    $opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
    Register-ScheduledTask -TaskName 'Girumo RAG noturno' -Action $acao -Trigger $quando `
        -Settings $opcoes -Force | Out-Null
    Write-Output "Agendado: 'Girumo RAG noturno' todo dia as 03h17. Logs em $logDir"
    return
}

$log = Join-Path $logDir ("nightly-{0:yyyy-MM-dd}.log" -f (Get-Date))
& {
    "== $(Get-Date -Format s) inicio"
    git -C $Worktree fetch origin main
    if ($LASTEXITCODE -ne 0) { throw "git fetch falhou ($LASTEXITCODE)" }
    git -C $Worktree checkout --force --detach origin/main
    if ($LASTEXITCODE -ne 0) { throw "checkout de origin/main falhou ($LASTEXITCODE)" }
    "commit: $(git -C $Worktree log --oneline -1)"

    $env:PYTHONPATH = Join-Path $Worktree 'tools\lightrag'
    $env:LIGHTRAG_DATA_DIR = $dados
    $env:LIGHTRAG_PROFILE = 'tech'
    $env:PYTHONIOENCODING = 'utf-8'
    Push-Location $Worktree
    try {
        & $python -m lightrag_kg.cli index --incremental
        if ($LASTEXITCODE -ne 0) { throw "rag index saiu com $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
    "== $(Get-Date -Format s) fim"
} *>> $log
