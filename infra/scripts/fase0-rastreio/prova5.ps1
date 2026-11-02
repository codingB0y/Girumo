# infra/scripts/fase0-rastreio/prova5.ps1
# Prova 5 do Rastreio de uma vez, em qualquer aba: as 6 perguntas, quem e o dono do token e a medicao.
# ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI.
#   & .\infra\scripts\fase0-rastreio\prova5.ps1
$ErrorActionPreference = 'Stop'
& "$PSScriptRoot\credenciais-me.ps1"
node "$PSScriptRoot\melhor-envio.mjs" quem
node "$PSScriptRoot\melhor-envio.mjs" medir sem-filtro 14-0
