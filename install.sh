#!/usr/bin/env bash
# install.sh — RouterMod installer for Linux VPS
# Usage: bash install.sh [--port PORT] [--data-dir DIR] [--password PASS]
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
PORT="${PORT:-1945}"
DATA_DIR="${DATA_DIR:-$HOME/.local/share/routermod}"
INITIAL_PASSWORD="${INITIAL_PASSWORD:-changeme}"
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_MIN=20

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)      PORT="$2";              shift 2 ;;
    --data-dir)  DATA_DIR="$2";          shift 2 ;;
    --password)  INITIAL_PASSWORD="$2";  shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        RouterMod — VPS Installer         ║"
echo "╚══════════════════════════════════════════╝"
echo "  App dir : $APP_DIR"
echo "  Port    : $PORT"
echo "  Data dir: $DATA_DIR"
echo ""

# ── OS detection ──────────────────────────────────────────────────────────────
if [[ -f /etc/os-release ]]; then
  . /etc/os-release
  OS_ID="${ID:-unknown}"
else
  OS_ID="unknown"
fi

PKG_INSTALL=""
case "$OS_ID" in
  ubuntu|debian|linuxmint|pop)  PKG_INSTALL="apt-get install -y" ;;
  centos|rhel|almalinux|rocky)  PKG_INSTALL="yum install -y"     ;;
  fedora)                        PKG_INSTALL="dnf install -y"     ;;
  arch|manjaro)                  PKG_INSTALL="pacman -S --noconfirm" ;;
  *) echo "⚠  Unknown distro '$OS_ID' — skip system packages, continuing..." ;;
esac

# ── System packages ───────────────────────────────────────────────────────────
if [[ -n "$PKG_INSTALL" ]]; then
  echo "▸ Installing system dependencies..."
  if [[ "$OS_ID" == "ubuntu" || "$OS_ID" == "debian" || "$OS_ID" == "linuxmint" || "$OS_ID" == "pop" ]]; then
    apt-get update -qq
    $PKG_INSTALL \
      curl wget git python3 python3-pip python3-venv \
      chromium-browser chromium-driver \
      ca-certificates gnupg lsb-release \
      build-essential 2>/dev/null || \
    $PKG_INSTALL \
      curl wget git python3 python3-pip python3-venv \
      google-chrome-stable \
      ca-certificates gnupg lsb-release \
      build-essential 2>/dev/null || true
  elif [[ "$OS_ID" == "centos" || "$OS_ID" == "rhel" || "$OS_ID" == "almalinux" || "$OS_ID" == "rocky" ]]; then
    $PKG_INSTALL curl wget git python3 python3-pip chromium chromedriver gcc-c++ make || true
  elif [[ "$OS_ID" == "fedora" ]]; then
    $PKG_INSTALL curl wget git python3 python3-pip chromium chromedriver gcc-c++ make || true
  fi
fi

# ── Node.js ───────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "▸ Installing Node.js $NODE_MIN via NodeSource..."
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MIN}.x" | bash - 2>/dev/null || \
  curl -fsSL "https://rpm.nodesource.com/setup_${NODE_MIN}.x" | bash - 2>/dev/null || true
  if [[ -n "$PKG_INSTALL" ]]; then
    $PKG_INSTALL nodejs || true
  fi
fi

NODE_VER=$(node -e "process.exit(+process.versions.node.split('.')[0])" 2>/dev/null; echo $?)
NODE_MAJOR=$(node -e "console.log(+process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
if [[ "$NODE_MAJOR" -lt "$NODE_MIN" ]]; then
  echo "✗ Node.js $NODE_MIN+ required, found $(node --version 2>/dev/null || echo none). Install manually."
  exit 1
fi
echo "✓ Node.js $(node --version)"

# ── npm ───────────────────────────────────────────────────────────────────────
if ! command -v npm &>/dev/null; then
  echo "✗ npm not found. Install Node.js $NODE_MIN+ first."; exit 1
fi

# ── PM2 ───────────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "▸ Installing PM2..."
  npm install -g pm2
fi
echo "✓ PM2 $(pm2 --version)"

# ── Python + selenium ─────────────────────────────────────────────────────────
PYTHON=$(command -v python3 || command -v python || echo "")
if [[ -z "$PYTHON" ]]; then
  echo "✗ Python 3 not found. Install python3 manually."; exit 1
fi
echo "✓ Python $($PYTHON --version)"

if ! $PYTHON -c "import selenium" &>/dev/null; then
  echo "▸ Installing selenium..."
  $PYTHON -m pip install --quiet selenium
fi
echo "✓ selenium $($PYTHON -c "import selenium; print(selenium.__version__)" 2>/dev/null)"

# ── Chrome / ChromeDriver check ───────────────────────────────────────────────
CHROME=$(command -v google-chrome || command -v google-chrome-stable || \
         command -v chromium-browser || command -v chromium || echo "")
if [[ -z "$CHROME" ]]; then
  echo "⚠  Chrome/Chromium not found in PATH."
  echo "   Bot feature requires Chrome. Install manually:"
  echo "   Ubuntu/Debian: apt-get install -y chromium-browser"
  echo "   Or:            https://www.google.com/chrome/"
else
  echo "✓ Chrome: $CHROME"
fi

# ── npm install ───────────────────────────────────────────────────────────────
cd "$APP_DIR"
echo "▸ Installing npm dependencies..."
npm install --prefer-offline 2>&1 | tail -5

# ── .env.local ────────────────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/.env.local"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "▸ Creating .env.local..."
  JWT_SECRET=$(node -e "const c=require('crypto');console.log(c.randomBytes(48).toString('hex'))")
  cat > "$ENV_FILE" <<EOF
JWT_SECRET=$JWT_SECRET
INITIAL_PASSWORD=$INITIAL_PASSWORD
DATA_DIR=$DATA_DIR
PORT=$PORT
NODE_ENV=production
AUTH_COOKIE_SECURE=false
BASE_URL=http://localhost:$PORT
NEXT_PUBLIC_BASE_URL=http://localhost:$PORT
CLOUD_URL=https://9router.com
NEXT_PUBLIC_CLOUD_URL=https://9router.com
EOF
  echo "✓ .env.local created"
else
  echo "✓ .env.local exists, skipping"
fi

# ── Data dir ──────────────────────────────────────────────────────────────────
mkdir -p "$DATA_DIR/db"
echo "✓ Data dir: $DATA_DIR"

# ── Build ─────────────────────────────────────────────────────────────────────
echo "▸ Building production bundle (this takes ~1–2 min)..."
npm run build

# ── Copy standalone assets ────────────────────────────────────────────────────
# postbuild script handles this but run explicitly as fallback
if [[ -d ".next/standalone" ]]; then
  cp -r .next/static  .next/standalone/.next/static  2>/dev/null || true
  cp -r public        .next/standalone/public         2>/dev/null || true
  cp -r src           .next/standalone/src            2>/dev/null || true
fi

# ── ecosystem.config.js (Linux) ───────────────────────────────────────────────
ECOSYSTEM="$APP_DIR/ecosystem.config.js"
cat > "$ECOSYSTEM" <<EOF
const path = require("path");
module.exports = {
  apps: [{
    name: "routermod",
    script: ".next/standalone/custom-server.js",
    cwd: __dirname,
    watch: false,
    env: {
      PORT: "$PORT",
      NODE_ENV: "production",
      HOSTNAME: "0.0.0.0",
      DATA_DIR: "$DATA_DIR",
    },
  }],
};
EOF
echo "✓ ecosystem.config.js updated"

# ── PM2 start ─────────────────────────────────────────────────────────────────
echo "▸ Starting with PM2..."
pm2 delete routermod 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         RouterMod installed! ✓           ║"
echo "╠══════════════════════════════════════════╣"
echo "║  URL      : http://localhost:$PORT"
echo "║  Password : $INITIAL_PASSWORD"
echo "║  Data     : $DATA_DIR"
echo "║  PM2      : pm2 status routermod"
echo "║  Logs     : pm2 logs routermod"
echo "║  Rebuild  : node rebuild.js"
echo "╚══════════════════════════════════════════╝"
echo ""
