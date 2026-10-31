# infra/scripts/fase0-recuperar/credenciais.ps1
# Rode NA JANELA DO IGOR (nunca por ferramenta do Claude). Pede cada valor sem eco e guarda so no ambiente desta janela:
# nada vai para arquivo, e o historico do PowerShell guarda este comando, nao o que voce digita.
# ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI e estragaria os acentos.
#   & .\infra\scripts\fase0-recuperar\credenciais.ps1               tudo (aba de comandos)
#   & .\infra\scripts\fase0-recuperar\credenciais.ps1 -SoCaptura    so os marcadores (aba do servidor de captura; sem credencial)
param([switch]$SoCaptura)

# Tudo sem eco: a sessao le as abas, e telefone, e-mail ou alias digitado com eco iria para o contexto dela.
function Ler-SemEco([string]$Dica) {
  $seguro = Read-Host -Prompt $Dica -AsSecureString
  return [System.Net.NetworkCredential]::new('', $seguro).Password.Trim()
}

function Pedir-Segredo([string]$Nome, [string]$Dica) {
  $texto = Ler-SemEco "$Nome ($Dica)"
  if ([string]::IsNullOrWhiteSpace($texto)) { throw "$Nome vazio" }
  Set-Item -Path "Env:$Nome" -Value $texto
}

# Marcador generico ("gmail.com", "9") gravaria cliente de verdade: so e-mail completo ou telefone de 8 a 11 digitos.
# O erro diz a posicao, nunca o valor.
function Validar-Marcadores([string]$Texto) {
  $itens = @($Texto -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($itens.Count -eq 0) { throw 'FASE0_MARCADORES vazio' }
  $emails = 0
  $telefones = 0
  for ($i = 0; $i -lt $itens.Count; $i++) {
    if ($itens[$i] -match '^[^\s@,]+@[^\s@,]+\.[^\s@,]+$') { $emails++ }
    elseif ($itens[$i] -match '^\d{8,11}$') { $telefones++ }
    else { throw "FASE0_MARCADORES: o item $($i + 1) ($($itens[$i].Length) caracteres) nao e e-mail completo nem telefone de 8 a 11 digitos" }
  }
  return "$emails e-mail(s), $telefones telefone(s)"
}

# Um digito errado manda mensagem para um estranho: formato conferido aqui e o valor digitado duas vezes.
function Validar-Celulares([string]$Texto) {
  $itens = @($Texto -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $rotulos = @()
  for ($i = 0; $i -lt $itens.Count; $i++) {
    if ($itens[$i] -notmatch '^([A-Za-z]+)=(55\d{10,11})$') { throw "FASE0_CELULARES: o item $($i + 1) nao esta no formato ROTULO=55DDDNUMERO (so digitos)" }
    $rotulos += $Matches[1].ToUpper()
  }
  foreach ($obrigatorio in 'CHIP', 'B') { if ($rotulos -notcontains $obrigatorio) { throw "FASE0_CELULARES sem $obrigatorio=55..." } }
  return ($rotulos -join ', ')
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

$resumo = @()
$marcadores = Ler-SemEco 'FASE0_MARCADORES (e-mail dos checkouts de teste e os 9 digitos do telefone B, sem 55 nem DDD, separados por virgula; nao aparece na tela)'
$resumo += "FASE0_MARCADORES: $(Validar-Marcadores $marcadores)"
$env:FASE0_MARCADORES = $marcadores
if (-not $SoCaptura) {
  $celulares = Ler-SemEco 'FASE0_CELULARES (CHIP=55...,B=55...,C=55...  so digitos, com 55; nao aparece na tela)'
  $resumo += "FASE0_CELULARES: $(Validar-Celulares $celulares)"
  if ((Ler-SemEco 'FASE0_CELULARES de novo, para conferir') -ne $celulares) { throw 'FASE0_CELULARES: as duas digitacoes nao batem; rode o script de novo' }
  $env:FASE0_CELULARES = $celulares
  Pedir-Segredo 'FASE0_LOJA_TERMOS' 'nome da loja e do dominio, separados por virgula'
  Pedir-Segredo 'YAMPI_ALIAS' 'alias da loja piloto'
  Pedir-Segredo 'YAMPI_USER_TOKEN' 'Yampi > Perfil > Credenciais de API'
  Pedir-Segredo 'YAMPI_USER_SECRET_KEY' 'idem'
  Pedir-Segredo 'EVOLUTION_API_KEY' 'AUTHENTICATION_API_KEY do recurso evolution-api no Coolify'
}

$resumo
Get-ChildItem Env: | Where-Object { $_.Name -match '^(FASE0_|YAMPI_|EVOLUTION_)' } | ForEach-Object { '{0,-22} {1} caracteres' -f $_.Name, $_.Value.Length }
