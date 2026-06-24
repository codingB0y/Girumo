$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

$patterns = @(
  "sk_live_[A-Za-z0-9_]+",
  "sk_test_[A-Za-z0-9_]+",
  "whsec_[A-Za-z0-9_]+",
  "SUPABASE_SERVICE_ROLE_KEY=eyJ",
  "STRIPE_SECRET_KEY=sk_",
  "STRIPE_WEBHOOK_SECRET=whsec_",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_",
  "ENGINE_TOKEN=[A-Za-z0-9_\-]{24,}"
)

$excluded = @(
  ".git",
  "node_modules",
  ".next",
  "package-lock.json",
  "infra/scripts/scan-secrets.ps1",
  ".env.example",
  ".env.production.example",
  "deploy/stripe/setup.md",
  "hubflow-engine/auth",
  "hubflow-engine/sessions",
  "apps/web/data"
)

$allowedExtensions = @(
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".sql",
  ".ps1",
  ".sh",
  ".yml",
  ".yaml",
  ".example",
  ".env"
)

$files = Get-ChildItem -Recurse -File | Where-Object {
  $path = $_.FullName
  $normalizedPath = $path.Replace("\", "/")
  $name = $_.Name
  $extension = $_.Extension

  if ($name -like "*.png" -or $name -like "*.jpg" -or $name -like "*.jpeg" -or $name -like "*.gif" -or $name -like "*.ico" -or $name -like "*.svg") {
    return $false
  }

  if (-not ($allowedExtensions -contains $extension) -and -not ($name -like "*.env*")) {
    return $false
  }

  foreach ($part in $excluded) {
    $normalizedPart = $part.Replace("\", "/")
    if ($normalizedPath -like "*$normalizedPart*") {
      return $false
    }
  }
  return $true
}

$findings = @()
foreach ($file in $files) {
  $relative = Resolve-Path -Relative $file.FullName
  $content = Get-Content -Raw -ErrorAction SilentlyContinue $file.FullName
  if ($null -eq $content) {
    continue
  }

  foreach ($pattern in $patterns) {
    if ($content -match $pattern) {
      $findings += "${relative}: pattern ${pattern}"
    }
  }
}

if ($findings.Count -gt 0) {
  Write-Host "Possiveis secrets encontrados:"
  $findings | ForEach-Object { Write-Host " - $_" }
  throw "Scan de secrets falhou."
}

Write-Host "Scan de secrets OK."
