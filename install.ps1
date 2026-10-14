# install.ps1 — RouterMod installer for Windows
# Usage: .\install.ps1 [-Port 1945] [-DataDir "C:\..."] [-Password changeme]
# Run as Administrator recommended (for Chocolatey / system installs)
param(
  [int]   $Port     = 1945,
  [string]$DataDir  = "$env:APPDATA\routermod",
  [string]$Password = "changeme"
)

$ErrorActionPreference = "Stop"
$AppDir = $PSScriptRoot
$NodeMin = 20

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║      RouterMod — Windows Installer       ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "  App dir : $AppDir"
Write-Host "  Port    : $Port"
Write-Host "  Data dir: $DataDir"
Write-Host ""

# ── Helper ────────────────────────────────────────────────────────────────────
function Test-Command($cmd) { $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue) }

function Invoke-Step($label, [scriptblock]$block) {
  Write-Host "▸ $label..." -ForegroundColor Yellow
  & $block
  Write-Host "✓ $label" -ForegroundColor Green
}

# ── Chocolatey ────────────────────────────────────────────────────────────────
if (-not (Test-Command choco)) {
  Invoke-Step "Installing Chocolatey" {
    Set-ExecutionPolicy Bypass -Scope Process -Force
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
    Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  }
} else {
  Write-Host "✓ Chocolatey $(choco --version)" -ForegroundColor Green
}

# ── Node.js ───────────────────────────────────────────────────────────────────
$nodeOk = $false
if (Test-Command node) {
  $nodeMajor = [int](node -e "console.log(process.versions.node.split('.')[0])" 2>$null)
  if ($nodeMajor -ge $NodeMin) { $nodeOk = $true }
}
if (-not $nodeOk) {
  Invoke-Step "Installing Node.js $NodeMin" {
    choco install nodejs-lts -y --version="$NodeMin.0.0" 2>&1 | Out-Null
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  }
}
Write-Host "✓ Node.js $(node --version)" -ForegroundColor Green

# ── PM2 ───────────────────────────────────────────────────────────────────────
if (-not (Test-Command pm2)) {
  Invoke-Step "Installing PM2" { npm install -g pm2 | Out-Null }
}
Write-Host "✓ PM2 $(pm2 --version)" -ForegroundColor Green

# ── Python/selenium NOT needed — bot uses puppeteer-core (Node.js) ───────────
Write-Host "✓ Bot engine: puppeteer-core (Node.js) — no Python required" -ForegroundColor Green

# ── Chrome ────────────────────────────────────────────────────────────────────
$chrome = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
  "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Write-Host "⚠  Chrome not found. Bot feature requires Chrome." -ForegroundColor Yellow
  Write-Host "   Install: https://www.google.com/chrome/" -ForegroundColor Yellow
  Write-Host "   Or: choco install googlechrome -y" -ForegroundColor Yellow
} else {
  Write-Host "✓ Chrome: $chrome" -ForegroundColor Green
}

# ── npm install ───────────────────────────────────────────────────────────────
Set-Location $AppDir
Invoke-Step "Installing npm dependencies" {
  npm install --prefer-offline 2>&1 | Select-Object -Last 5 | Write-Host
}

# ── .env.local ────────────────────────────────────────────────────────────────
$envFile = Join-Path $AppDir ".env.local"
if (-not (Test-Path $envFile)) {
  Invoke-Step "Creating .env.local" {
    $jwtSecret = node -e "const c=require('crypto');console.log(c.randomBytes(48).toString('hex'))"
    @"
JWT_SECRET=$jwtSecret
INITIAL_PASSWORD=$Password
DATA_DIR=$DataDir
PORT=$Port
NODE_ENV=production
AUTH_COOKIE_SECURE=false
BASE_URL=http://localhost:$Port
NEXT_PUBLIC_BASE_URL=http://localhost:$Port
CLOUD_URL=https://9router.com
NEXT_PUBLIC_CLOUD_URL=https://9router.com
"@ | Set-Content $envFile -Encoding UTF8
  }
} else {
  Write-Host "✓ .env.local exists, skipping" -ForegroundColor Green
}

# ── Data dir ──────────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force "$DataDir\db" | Out-Null
Write-Host "✓ Data dir: $DataDir" -ForegroundColor Green

# ── Build ─────────────────────────────────────────────────────────────────────
Invoke-Step "Building production bundle (~1-2 min)" {
  npm run build
}

# ── Copy standalone assets (in case postbuild missed) ─────────────────────────
$standalone = Join-Path $AppDir ".next\standalone"
if (Test-Path $standalone) {
  $null = xcopy /E /Y /I ".next\static"  ".next\standalone\.next\static" 2>$null
  $null = xcopy /E /Y /I "public"        ".next\standalone\public"        2>$null
  $null = xcopy /E /Y /I "src"           ".next\standalone\src"           2>$null
}

# ── ecosystem.config.js ───────────────────────────────────────────────────────
@"
const path = require("path");
module.exports = {
  apps: [{
    name: "routermod",
    script: ".next/standalone/custom-server.js",
    cwd: __dirname,
    watch: false,
    env: {
      PORT: "$Port",
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      DATA_DIR: "$($DataDir -replace '\\', '\\\\')",
    },
  }],
};
"@ | Set-Content (Join-Path $AppDir "ecosystem.config.js") -Encoding UTF8
Write-Host "✓ ecosystem.config.js updated" -ForegroundColor Green

# ── PM2 start ─────────────────────────────────────────────────────────────────
Invoke-Step "Starting with PM2" {
  pm2 delete routermod 2>$null | Out-Null
  pm2 start ecosystem.config.js
  pm2 save
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║       RouterMod installed! ✓             ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  URL      : http://localhost:$Port"
Write-Host "║  Password : $Password"
Write-Host "║  Data     : $DataDir"
Write-Host "║  PM2      : pm2 status routermod"
Write-Host "║  Logs     : pm2 logs routermod"
Write-Host "║  Rebuild  : node rebuild.js"
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
