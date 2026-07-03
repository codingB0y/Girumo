param(
  [Parameter(Mandatory = $true)]
  [string] $Path,

  [Parameter(Mandatory = $false)]
  [ValidateSet("vercel", "coolify")]
  [string] $Profile = "vercel"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Path)) {
  throw "Arquivo nao encontrado: $Path"
}

$requiredByProfile = @{
  vercel = @(
    "NEXT_PUBLIC_APP_URL",
    "NEXT_PUBLIC_APP_ENV",
    "AUTH_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_PRICE_ESSENCIAL",
    "STRIPE_PRICE_GROWTH",
    "STRIPE_PRICE_PERFORMANCE_MAX",
    "ENGINE_TOKEN",
    "CRON_SECRET",
    "HUBFLOW_DATA_DIR"
  )
  coolify = @(
    "ENGINE_PORT",
    "APP_URL",
    "ENGINE_TOKEN",
    "ENGINE_TENANT_ID",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "ENGINE_COMMAND_POLL_MS",
    "ENGINE_COMMAND_BATCH_SIZE",
    "ENGINE_STATE_FILE"
  )
}

$content = Get-Content $Path
$keys = @{}

foreach ($line in $content) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith("#")) {
    continue
  }

  $parts = $trimmed.Split("=", 2)
  if ($parts.Count -ge 1 -and $parts[0]) {
    $keys[$parts[0]] = $true
  }
}

$missing = @()
foreach ($key in $requiredByProfile[$Profile]) {
  if (-not $keys.ContainsKey($key)) {
    $missing += $key
  }
}

if ($missing.Count -gt 0) {
  throw "Variaveis ausentes em ${Path}: $($missing -join ', ')"
}

Write-Host "Template $Profile OK: $Path"
