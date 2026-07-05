$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

$patterns = @(
  "sk_live_[A-Za-z0-9_]+",
  "sk_test_[A-Za-z0-9_]+",
  "whsec_[A-Za-z0-9_]+",
  "SUPABASE_SERVICE_ROLE_KEY=eyJ[A-Za-z0-9._-]{20,}",
  "STRIPE_SECRET_KEY=sk_(live|test)_[A-Za-z0-9]{16,}",
  "STRIPE_WEBHOOK_SECRET=whsec_[A-Za-z0-9]{16,}",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_[A-Za-z0-9]{16,}",
  "ENGINE_TOKEN=[A-Za-z0-9_\-]{24,}"
)

$tracked = @(& git ls-files)
if ($LASTEXITCODE -ne 0) { throw "git ls-files falhou: exit $LASTEXITCODE" }

$excludedExact = @(
  "infra/scripts/scan-secrets.ps1",
  "deploy/stripe/setup.md"
)
$binaryExtensions = @(".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".pdf")

$findings = @()
foreach ($relative in $tracked) {
  $normalized = $relative.Replace("\", "/")
  if ($excludedExact -contains $normalized) { continue }
  if ($normalized -like "*.example" -or $normalized -like "*.example.*") { continue }
  if ($binaryExtensions | Where-Object { $normalized.ToLowerInvariant().EndsWith($_) }) { continue }

  $path = Join-Path $root ($normalized.Replace("/", "\"))
  $content = Get-Content -LiteralPath $path -Raw -ErrorAction SilentlyContinue
  if ($null -eq $content) { continue }

  foreach ($pattern in $patterns) {
    if ($content -match $pattern) {
      $findings += "${normalized}: pattern ${pattern}"
    }
  }
}

if ($findings.Count -gt 0) {
  Write-Host "Possiveis secrets encontrados:"
  $findings | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host "Scan de secrets OK."
exit 0
