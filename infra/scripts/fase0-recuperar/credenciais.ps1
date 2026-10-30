# infra/scripts/fase0-recuperar/credenciais.ps1
# Rode NA JANELA DO IGOR (nunca por ferramenta do Claude). Pede cada valor sem eco e guarda so no ambiente desta janela:
# nada vai para arquivo, e o historico do PowerShell guarda este comando, nao o que voce digita.
# ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI e estragaria os acentos.
#   & .\infra\scripts\fase0-recuperar\credenciais.ps1               tudo (aba de comandos)
#   & .\infra\scripts\fase0-recuperar\credenciais.ps1 -SoCaptura    so os marcadores (aba do servidor de captura; sem credencial)
param([switch]$SoCaptura)

function Pedir-Texto([string]$Nome, [string]$Dica, [string]$Padrao = '') {
  $texto = Read-Host -Prompt "$Nome ($Dica)"
  if ([string]::IsNullOrWhiteSpace($texto)) { $texto = $Padrao }
  if ([string]::IsNullOrWhiteSpace($texto)) { throw "$Nome vazio" }
  Set-Item -Path "Env:$Nome" -Value $texto.Trim()
}

function Pedir-Segredo([string]$Nome, [string]$Dica) {
  $seguro = Read-Host -Prompt "$Nome ($Dica)" -AsSecureString
  $texto = [System.Net.NetworkCredential]::new('', $seguro).Password
  if ([string]::IsNullOrWhiteSpace($texto)) { throw "$Nome vazio" }
  Set-Item -Path "Env:$Nome" -Value $texto.Trim()
}

$env:FASE0_BRUTO = Join-Path $env:USERPROFILE 'fase0-recuperar-bruto'
New-Item -ItemType Directory -Force $env:FASE0_BRUTO | Out-Null
# Nome da instancia fixado no bruto na primeira vez: o padrao das ferramentas usa a data UTC, que vira as 21h de Brasilia,
# e o "apagar" do fim miraria outro nome e deixaria a instancia de teste na VPS de producao.
$arqInstancia = Join-Path $env:FASE0_BRUTO 'instancia.txt'
if (-not (Test-Path $arqInstancia)) { 'fase0-recuperar-' + (Get-Date -Format 'yyyyMMdd') | Set-Content -Path $arqInstancia -Encoding ascii }
$env:FASE0_INSTANCIA = (Get-Content -Path $arqInstancia -Raw).Trim()
$env:EVOLUTION_API_URL = 'https://wa.girumo.com.br'
$env:FASE0_FRASES = 'Ola, teste da Fase 0|Oi, recebi sim|quem e voce?|SAIR|Teste 1 da Fase 0|Teste 2 da Fase 0|Teste de imagem da Fase 0|Teste do celular do chip|Teste da Fase 0 (numero que nao existe)'

Pedir-Texto 'FASE0_MARCADORES' 'e-mail dos checkouts de teste e os 9 digitos do telefone B (sem 55 nem DDD), separados por virgula'
if (-not $SoCaptura) {
  Pedir-Texto 'FASE0_CELULARES' 'CHIP=55...,B=55...,C=55...  so digitos, com 55'
  Pedir-Texto 'FASE0_LOJA_TERMOS' 'nome da loja e do dominio, separados por virgula' 'sem-termos'
  Pedir-Texto 'YAMPI_ALIAS' 'alias da loja piloto'
  Pedir-Segredo 'YAMPI_USER_TOKEN' 'Yampi > Perfil > Credenciais de API'
  Pedir-Segredo 'YAMPI_USER_SECRET_KEY' 'idem'
  Pedir-Segredo 'EVOLUTION_API_KEY' 'AUTHENTICATION_API_KEY do recurso evolution-api no Coolify'
}

Get-ChildItem Env: | Where-Object { $_.Name -match '^(FASE0_|YAMPI_|EVOLUTION_)' } | ForEach-Object { '{0,-22} {1} caracteres' -f $_.Name, $_.Value.Length }
