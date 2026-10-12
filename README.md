<div align="center">

<img src="./images/routermod-login.png" alt="RouterMod Login" width="800" style="border-radius:12px;margin-bottom:6px"/>
<img src="./images/routermod-dashboard.png" alt="RouterMod Dashboard" width="800" style="border-radius:12px"/>

# RouterMod

**AI Router & Token Saver — a fork of 9Router with a modern Neobrutalism UI, auto-tunneling, and a bunch of quality-of-life improvements.**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Based On](https://img.shields.io/badge/based%20on-9Router-crimson)](https://github.com/decolua/9router)
[![Port](https://img.shields.io/badge/default%20port-1945-orange)](#quick-start)
[![Stack](https://img.shields.io/badge/Next.js%2016%20%2B%20React%2019-black?logo=nextdotjs)](#tech-stack)

[🚀 Quick Start](#-quick-start) • [✨ What's Different](#-whats-different-from-9router) • [💡 Features](#-features) • [📖 Setup](#-setup)

> 🇮🇩 **Pengguna Indonesia?** Klik tombol di bawah untuk versi Bahasa Indonesia.

<details>
<summary><b>🇮🇩 Baca dalam Bahasa Indonesia</b></summary>

## RouterMod — Panduan Bahasa Indonesia

RouterMod adalah fork dari 9Router yang di-redesign habis-habisan. UI-nya pakai tema Neobrutalism 3D dengan accent Cyber Crimson, tunneling ke domain publik otomatis, dan berbagai fitur tambahan yang bikin workflow lebih enak.

### Quick Start

```bash
git clone <repo> routermod && cd routermod
npm install
npm run dev          # dev mode, port 1945
# atau
node rebuild.js      # production + PM2 restart
```

Login: `http://localhost:1945` · Password default: `merdeka`

### Cara pakai di Claude Code / Cline / Cursor dll:

```
Endpoint : http://localhost:1945/v1
API Key  : ambil dari Dashboard → Endpoint
Model    : kr/claude-sonnet-4.5
```

### Perbedaan dari 9Router

| | 9Router | RouterMod |
|---|---|---|
| **Rename / re-prefix model** | Tidak bisa | **Edit prefix, model ID, display name per model** |
| **Custom model CRUD** | Terbatas | **Edit ID, nama, hapus; fetch live dari endpoint `/models`** |
| **Disable/enable model** | Tidak ada | **Nonaktifkan model tertentu; bulk Disable All / Enable All** |
| **Strategi routing provider** | Fixed | **Toggle Round Robin + Sticky limit yang bisa diatur** |
| **Thinking mode** | Tidak ada | **Pilih level reasoning per provider, suffix otomatis ditambahkan** |
| **Proxy per connection** | Tidak ada | **Assign proxy pool per connection; bulk assign rotate atau single pool** |
| **Deploy proxy relay** | Tidak ada | **Deploy ke Vercel / Cloudflare / Netlify / Deno Deploy langsung dari dashboard** |
| **Custom headers provider** | Tidak ada | **Override atau tambah header per provider, diff-on-save** |
| **Whitelist model per API key** | Tidak ada | **Batasi tiap API key hanya ke model/combo tertentu** |
| **Auto-ping quota reset** | Tidak ada | **Toggle per connection (Claude/Codex) — ping otomatis saat reset 5 jam** |
| **Reorder priority connection** | Tidak ada | **Panah atas/bawah untuk atur urutan fallback** |
| **Bulk import akun** | Tidak ada | **Import massal untuk Codex, Grok CLI, Antigravity** |
| **Test semua model** | Satu per satu | **Jalankan semua model sekaligus, progress bar, bisa distop** |
| **Suggested models** | Tidak ada | **Chip model yang belum dikonfigurasi — klik langsung tambah** |
| **Tunneling publik** | Tidak ada | **CF Tunnel + CF DNS + Caddy/Nginx, subdomain persisten** |
| **Dashboard access gate** | Tidak ada | **Blokir dashboard di domain publik, API tetap jalan** |
| **Live server monitoring** | Tidak ada | **Tab CPU/RAM/disk/host, auto-refresh 3 detik** |
| **OAuth flow** | Copy-paste URL manual | **Auto-buka tab baru** |
| **Status free provider** | Offline jika 0 akun | **Selalu ONLINE + tampil `∞`** |
### Tunneling Publik

1. Dashboard → Settings → Tunnel
2. Isi Cloudflare API Token + Zone ID + subdomain
3. Klik **Enable** → Caddy + CF DNS jalan otomatis
4. Subdomain tidak berubah walau di-restart

### Tips Gratis Total

```
Combo free-combo:
  1. kr/claude-sonnet-4.5   (Claude 4.5 via Kiro, ~50 kredit/bulan)
  2. kr/glm-5               (GLM-5 via Kiro)
  3. oc/<auto>              (OpenCode Free, no auth)
Biaya: Rp 0
```

</details>

</div>

---

## 🚀 Quick Start

```bash
git clone <repo-url> routermod
cd routermod
npm install
npm run dev
```

Dashboard at `http://localhost:1945` · Default password: `merdeka`

**Production with PM2:**

```bash
node rebuild.js   # stops PM2 → builds → restarts
```

**Point your AI tool at RouterMod:**

```
Endpoint : http://localhost:1945/v1
API Key  : grab from Dashboard → Endpoint tab
Model    : kr/claude-sonnet-4.5
```

---

## ✨ What's Different from 9Router

RouterMod keeps everything 9Router does well and adds meaningful control where 9Router falls short.

| | 9Router | RouterMod |
|---|---|---|
| **Model rename / re-prefix** | Not possible | **Edit prefix, model ID, and display name per model — changes the routing string used in CLI tools** |
| **Custom model CRUD** | Basic add on compatible nodes | **Full edit on any provider — change ID, name, delete; live fetch from `/models` endpoint** |
| **Model disable/enable** | Not available | **Disable individual models per provider; bulk Disable All / Enable All** |
| **Provider routing strategy** | Fixed | **Toggle Round Robin + configurable Sticky limit per provider** |
| **Thinking mode per provider** | Not available | **Dropdown Auto/low/medium/high; suffix auto-appended to copied model string** |
| **Proxy per connection** | Not available | **Assign a proxy pool per connection inline; bulk assign with rotate or single-pool mode** |
| **Proxy pool deployment** | Not available | **Deploy relay to Vercel / Cloudflare / Netlify / Deno Deploy straight from the dashboard** |
| **Custom headers per provider** | Not available | **Override or add request headers per provider; diff-on-save, validation, reset to registry default** |
| **API key model whitelist** | Not available | **Restrict each API key to specific models or combos only** |
| **Auto-ping on quota reset** | Not available | **Per-connection toggle (Claude/Codex) — fires on 5-hour reset to start the window immediately** |
| **Connection priority reorder** | Not available | **Arrow up/down to reorder connections, affects fallback routing order** |
| **Bulk account import** | Not available | **Bulk import tokens/cookies/accounts for Codex, Grok CLI, and Antigravity** |
| **Test all models at once** | One at a time | **Run all models in sequence, live progress bar, stop anytime, 1 summary toast** |
| **Suggested models** | Not available | **Provider chips for unconfigured models (≥200k ctx, free) — click to add instantly** |
| **Public tunneling** | Not available | **Zero-config CF Tunnel + CF DNS + Caddy/Nginx; subdomain persists across restarts** |
| **Dashboard access gate** | No control | **Block web UI on public domain while keeping the API endpoint open** |
| **Live server monitoring** | Not available | **Dedicated tab — CPU, RAM, disk, host info, auto-refreshes every 3s** |
| **OAuth flow** | Manually copy & paste URL | **Auto-opens in new tab, no manual step** |
| **Free provider status** | Offline when 0 accounts | **Always ONLINE + shows `∞` — reflects that no account is needed** |

---

## 💡 Features

### Inherited from 9Router

| Feature | What it does |
|---|---|
| 🚀 **RTK Token Saver** | Compresses tool output (`git diff`, `grep`, `ls`…) — saves **20–40% input tokens** |
| 🪨 **Caveman Mode** | Injects terse prompt — saves **up to 65% output tokens** |
| 🐴 **Ponytail** | "Lazy senior dev" prompt — YAGNI-first, minimal code |
| 🎯 **3-Tier Fallback** | Auto-routes: Subscription → Cheap → Free, no downtime |
| 📊 **Quota Tracking** | Live token count + reset countdown |
| 🔄 **Format Translation** | OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex |
| 👥 **Multi-Account** | Round-robin or priority routing per provider |
| 🔄 **Auto Token Refresh** | OAuth tokens refresh automatically |
| 🎨 **Custom Combos** | Unlimited model combinations with fallback chains |
| 📝 **Request Logging** | Full request/response debug logs |
| 📊 **Usage Analytics** | Tokens, cost, trends per provider & model |

### Added in RouterMod

| Feature | What it does |
|---|---|
| 🌐 **Auto CF Tunneling** | Persistent public subdomain via Cloudflare Tunnel + DNS, survives restarts |
| 🔀 **Auto Reverse Proxy** | Caddy (Windows) / Nginx (Linux) — configured and started automatically |
| 🔒 **Dashboard Access Gate** | Block web UI on public domain while keeping API accessible |
| ⚡ **Test All Models** | Run all models at once, live progress bar, stop anytime, 1 summary toast |
| ♾️ **Free Provider Status** | noAuth providers always ONLINE + show `∞` account count |
| 📡 **Live Server Tab** | CPU, RAM, process memory, disk I/O, host info — auto-refreshes every 3s |
| 👥 **Antigravity Bulk Import** | Import lots of accounts at once via `email\|password` format |
| 🎨 **Neobrutalism UI** | Consistent 3D theme, offset shadows, Cyber Crimson accent across all pages |
| 🔔 **Community Popup** | Telegram + WhatsApp links, shows on every dashboard visit |
| 🌍 **OAuth Auto Popup** | No manual URL copy — auto-opens OAuth in new tab |

---

## 🌐 Supported Providers

### 🔐 OAuth
Claude Code · Antigravity · Codex · GitHub Copilot · Cursor · Kiro AI · Xiaomi Mimo · Zed

### 🆓 Free (no API key needed)

| Provider | Models | Quota |
|---|---|---|
| **Kiro AI** | Claude 4.5, GLM-5, MiniMax | ~50 credits/month |
| **OpenCode Free** | Auto-fetched from opencode.ai | Varies |
| **Vertex AI** | Gemini 3 Pro, DeepSeek, GLM | $300 credits for new GCP accounts |

### 🔑 API Key (40+ providers)
OpenRouter · OpenAI · Anthropic · Gemini · DeepSeek · Groq · xAI · Mistral · GLM · MiniMax · Kimi · Perplexity · Together AI · Fireworks · Cerebras · Cohere · NVIDIA · SiliconFlow · Nebius · Hyperbolic · and more

---

## 🛠️ Supported CLI Tools

Claude Code · OpenClaw · Codex · OpenCode · Cursor · Antigravity · Cline · Continue · Roo · Copilot · Kilo Code · Droid · Grok Build · Devin CLI · DeepSeek TUI · Qwen Code · jcode · and more

---

## 📖 Setup

### Environment

Copy `.env.example` to `.env`:

```env
PORT=1945
HOSTNAME=0.0.0.0
NODE_ENV=production
JWT_SECRET=change-this-to-something-secure
INITIAL_PASSWORD=merdeka
DATA_DIR=%APPDATA%\routermod
```

### PM2 Production

```bash
node rebuild.js     # build + restart in one command

pm2 status          # check process
pm2 logs routermod  # live logs
```

`ecosystem.config.js` runs `.next/standalone/custom-server.js` with `NODE_ENV: production` and `HOSTNAME: 0.0.0.0`.

### Public Tunneling

1. Dashboard → Settings → Tunnel
2. Enter Cloudflare API Token + Zone ID + target subdomain
3. Hit **Enable** — Caddy + CF DNS auto-configured
4. Subdomain persists across restarts — only regenerates if you disable then re-enable

### CLI Integration

**Claude Code / OpenClaw / Cline / Cursor:**
```json
{
  "baseUrl": "http://localhost:1945/v1",
  "apiKey": "sk-from-dashboard"
}
```

**Codex CLI:**
```bash
export OPENAI_BASE_URL="http://localhost:1945/v1"
export OPENAI_API_KEY="sk-from-dashboard"
```

---

## 📊 Combo Examples

**Zero cost:**
```
1. kr/claude-sonnet-4.5   → Kiro free (~50 credits/mo)
2. kr/glm-5               → GLM-5 via Kiro
3. oc/<auto>              → OpenCode Free, no auth
Cost: $0/month
```

**Maximize subscription:**
```
1. cc/claude-opus-4-7     → Claude Code subscription
2. glm/glm-5.1            → $0.6/1M token backup
3. kr/claude-sonnet-4.5   → Kiro free fallback
```

---

## 🛠️ Tech Stack

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16
- **UI**: React 19 + Tailwind CSS 4
- **Database**: SQLite (`%APPDATA%\routermod\db\routermod.sqlite`)
- **Streaming**: Server-Sent Events (SSE)
- **Auth**: OAuth 2.0 (PKCE) + JWT + API Keys
- **Process**: PM2 standalone mode
- **Tunnel**: Cloudflare Tunnel + Caddy

---

## 📝 API

```bash
# Chat completions
POST http://localhost:1945/v1/chat/completions
Authorization: Bearer <api-key>
Content-Type: application/json
{ "model": "kr/claude-sonnet-4.5", "messages": [...], "stream": true }

# List models
GET http://localhost:1945/v1/models
Authorization: Bearer <api-key>
```

---

## 🙏 Credits

RouterMod is built on top of:

- **[9Router](https://github.com/decolua/9router)** — the upstream AI router
- **[RTK](https://github.com/rtk-ai/rtk)** — token compression pipeline
- **[Caveman](https://github.com/JuliusBrussee/caveman)** — terse output prompt
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** — lazy senior dev prompt

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<div align="center">
  <sub>Fork of 9Router · Neobrutalism UI · Auto CF Tunneling · Port 1945</sub>
</div>
