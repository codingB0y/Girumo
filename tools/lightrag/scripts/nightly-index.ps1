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
# Uso unico (cria o worktree e agenda as 05h47):
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
    # 05h47, nao madrugada: a cota diaria do Gemini zera a meia-noite do Pacifico (04h00 de
    # Brasilia no horario de verao dos EUA, 05h00 fora dele). As 03h17 o run pegava a sobra
    # do dia anterior: em 01/11/2026 o 1o lote deu 429 com "retry in 36m".
    $quando = New-ScheduledTaskTrigger -Daily -At 5:47am
    # StartWhenAvailable: PC desligado as 05h47 roda quando ligar.
    $opcoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 3)
    Register-ScheduledTask -TaskName 'Girumo RAG noturno' -Action $acao -Trigger $quando `
        -Settings $opcoes -Force | Out-Null
    Write-Output "Agendado: 'Girumo RAG noturno' todo dia as 05h47. Logs em $logDir"
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

    # Indexador de rodada anterior ainda vivo gasta a cota do dia antes desta rodada e
    # escreve nos mesmos JSON. Matar o PowerShell (limite de 3h da tarefa, TaskStop) nao
    # mata o python filho: em 31/10/2026 havia um vivo desde 29/10 e a noite parou no 1o lote.
    Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" |
        Where-Object { $_.CommandLine -match 'lightrag_kg\.cli index' } |
        ForEach-Object {
            "matando indexador orfao pid $($_.ProcessId) (desde $($_.CreationDate))"
            Stop-Process -Id $_.ProcessId -Force
        }

    $env:PYTHONPATH = Join-Path $Worktree 'tools\lightrag'
    $env:LIGHTRAG_DATA_DIR = $dados
    $env:LIGHTRAG_PROFILE = 'tech'
    $env:PYTHONIOENCODING = 'utf-8'
    Push-Location $Worktree
    try {
        # --retry-failed: apaga o registro antigo dos arquivos do plano antes de inserir.
        # Sem isso, arquivo que falhou (cota diaria do Gemini) ou que mudou fica preso
        # no dedupe por nome do LightRAG e o retry vira no-op silencioso.
        & $python -m lightrag_kg.cli index --incremental --retry-failed
        $codigo = $LASTEXITCODE
        & $python -m lightrag_kg.cli stats
        # 1 = parte dos arquivos nao processou (quase sempre cota diaria do Gemini).
        # Eles ficam fora do manifest e entram de novo na proxima noite.
        if ($codigo -ne 0) { throw "rag index saiu com $codigo" }
    } finally {
        Pop-Location
    }
    "== $(Get-Date -Format s) fim"
} *>> $log
