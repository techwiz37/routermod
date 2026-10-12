<div align="center">

  <img src="./images/routermod-login.png" alt="RouterMod Login" width="800" style="border-radius:12px;margin-bottom:8px"/>
  <img src="./images/routermod-dashboard.png" alt="RouterMod Dashboard" width="800" style="border-radius:12px"/>

  # RouterMod

  **AI Router & Token Saver — fork dari 9Router dengan UI Neobrutalism, tunneling otomatis, dan pengalaman yang lebih modern.**

  [![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
  [![Based On](https://img.shields.io/badge/based%20on-9Router-crimson)](https://github.com/decolua/9router)
  [![Port](https://img.shields.io/badge/default%20port-1945-orange)](#quick-start)
  [![Stack](https://img.shields.io/badge/stack-Next.js%2016%20%2B%20React%2019-black)](#tech-stack)

  [🚀 Quick Start](#-quick-start) • [✨ Perbedaan dari 9Router](#-perbedaan-dari-9router) • [💡 Fitur Utama](#-fitur-utama) • [📖 Setup](#-setup-guide)

</div>

---

## ✨ Perbedaan dari 9Router

RouterMod adalah fork private dari 9Router yang di-redesign dan diperluas. Berikut perbedaan signifikan:

| Aspek | 9Router (upstream) | RouterMod (fork ini) |
|---|---|---|
| **UI Theme** | Default light/dark biasa | **3D Neobrutalism** — border tebal, shadow offset, Cyber Crimson `#ff1a53` accent |
| **Port default** | `20128` | **`1945`** |
| **Password default** | `123456` | **`merdeka`** |
| **Branding** | 9Router | **RouterMod** |
| **Tunneling** | Manual | **Otomatis** — Cloudflare Tunnel + CF DNS + Caddy reverse proxy (Windows) / Nginx (Linux), subdomain persisten lintas restart |
| **Dashboard akses publik** | Tidak ada gate | **Gate control** — blokir web UI di domain publik jika dinonaktifkan, API tetap jalan |
| **Provider Antigravity** | Import akun manual | + **Bulk Import modal** (`email\|password` per baris) dengan toast "Bot auto add hanya untuk VIP source" |
| **Test model** | 1 model per klik | + **"Test Semua" button** — jalankan test semua model sekaligus, progress bar realtime, stop kapanpun, 1 toast summary di akhir |
| **Status provider free** | Offline jika 0 akun | **Free/noAuth provider selalu ONLINE** + tampilkan `∞` (unlimited) di kolom akun |
| **Halaman Usage** | Tabel standar | **Redesign Neobrutalism** — kartu 3D, chart tooltip neobrutalism, Live Request Feed, tab **Live Server** (CPU/RAM/disk/host realtime) |
| **Topology diagram** | Node "9Router" + background polos | **Node "RouterMod"** + background dot-grid pattern + glow aktif Cyber Crimson |
| **OAuth flow** | Copy URL manual | **Auto popup** — URL otomatis dibuka di tab baru tanpa manual copy |
| **Error pesan OAuth** | English | **Bahasa Indonesia** |
| **Login remote** | Blokir jika pakai password default | **Diizinkan** — tidak ada paksa-ganti-password untuk akses remote |
| **Community popup** | Tidak ada | **Auto popup tiap visit** — link Telegram + WhatsApp, close button only, tema-aware |
| **Internal model ping** | Kena blokir key-access restriction | **Bypass** via header `x-9r-cli-token` — test model internal tidak perlu API key aktif |
| **Production build** | `npm run build` langsung | `node rebuild.js` — stop PM2 dulu (hindari Windows `EBUSY`), build, restart |
| **Process manager** | Tidak termasuk | **PM2** via `ecosystem.config.js`, standalone mode port 1945 |
| **Font loading** | Build-time Google Fonts | **Runtime `<link>`** — hindari timeout saat build |
| **Data dir** | `~/.9router` | `%APPDATA%\routermod` |

---

## 🤔 Mengapa RouterMod?

RouterMod mewarisi semua keunggulan 9Router, ditambah:

- 🎨 **Tampilan modern** — Neobrutalism 3D konsisten di semua halaman & mode gelap/terang
- 🌐 **Tunneling zero-config** — domain publik persisten tanpa setup manual setiap restart
- 🔒 **Access gate** — kendalikan siapa yang bisa akses dashboard dari luar
- ⚡ **Test model massal** — hemat waktu, tidak perlu klik satu per satu
- 📊 **Live Server monitoring** — CPU, RAM, disk, proses — semua di satu tab

---

## ⚡ Quick Start

**1. Clone & install:**

```bash
git clone <repo-url> routermod
cd routermod
npm install
```

**2. Jalankan (development):**

```bash
npm run dev
# Dashboard: http://localhost:1945
# Password default: merdeka
```

**3. Production dengan PM2:**

```bash
node rebuild.js
# Otomatis: stop PM2 → build → restart
```

**4. Gunakan di CLI tool:**

```
Endpoint : http://localhost:1945/v1
API Key  : [copy dari Dashboard → Endpoint]
Model    : kr/claude-sonnet-4.5
```

---

## 💡 Fitur Utama

### Warisan dari 9Router

| Fitur | Keterangan |
|---|---|
| 🚀 **RTK Token Saver** | Kompresi tool output (`git diff`, `grep`, `ls`…) — hemat **20–40% input token** |
| 🪨 **Caveman Mode** | Prompt terse → hemat **hingga 65% output token** |
| 🐴 **Ponytail** | "Lazy senior dev" prompt → YAGNI-first, kode minimal |
| 🎯 **3-Tier Fallback** | Auto-route: Subscription → Cheap → Free, zero downtime |
| 📊 **Quota Tracking** | Live token count + countdown reset |
| 🔄 **Format Translation** | OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex |
| 👥 **Multi-Account** | Round-robin / priority per provider |
| 🔄 **Auto Token Refresh** | OAuth token refresh otomatis |
| 🎨 **Custom Combos** | Kombinasi model tak terbatas dengan fallback |
| 📝 **Request Logging** | Debug mode full request/response |
| 📊 **Usage Analytics** | Token, biaya, tren per provider & model |

### Tambahan RouterMod

| Fitur | Keterangan |
|---|---|
| 🌐 **CF Tunnel Otomatis** | Subdomain persisten via Cloudflare Tunnel + CF DNS, tidak berubah lintas restart |
| 🔀 **Reverse Proxy Otomatis** | Caddy (Windows) / Nginx (Linux) — dikonfigurasi dan dijalankan otomatis |
| 🔒 **Dashboard Access Gate** | Blokir web UI di domain publik, API tetap bisa diakses |
| ⚡ **Test Semua Model** | Jalankan semua model sekaligus, progress bar, bisa distop, 1 toast summary |
| ♾️ **Status Free Provider** | Provider free/noAuth selalu ONLINE + tampil `∞` |
| 📡 **Live Server Tab** | CPU, RAM, memory proses, disk I/O, info host — refresh otomatis 3 detik |
| 👥 **Bulk Import Antigravity** | Import banyak akun sekaligus format `email\|password` |
| 🎨 **UI Neobrutalism** | Tema konsisten 3D, shadow offset, Cyber Crimson accent di semua halaman |
| 🔔 **Community Popup** | Link komunitas Telegram + WhatsApp otomatis muncul tiap visit |
| 🌍 **OAuth Auto Popup** | Tidak perlu copy-paste URL OAuth — otomatis dibuka di tab baru |

---

## 🌐 Provider yang Didukung

### 🔐 OAuth Providers
Claude Code · Antigravity · Codex · GitHub Copilot · Cursor · Kiro AI · Xiaomi Mimo · Zed

### 🆓 Free Providers (tanpa API key)

| Provider | Model | Kuota |
|---|---|---|
| **Kiro AI** | Claude 4.5, GLM-5, MiniMax | ~50 kredit/bulan |
| **OpenCode Free** | Auto-fetch dari opencode.ai | Bervariasi |
| **Vertex AI** | Gemini 3 Pro, DeepSeek, GLM | $300 kredit akun baru GCP |

### 🔑 API Key Providers (40+)
OpenRouter · OpenAI · Anthropic · Gemini · DeepSeek · Groq · xAI · Mistral · GLM · MiniMax · Kimi · Perplexity · Together AI · Fireworks · Cerebras · Cohere · NVIDIA · SiliconFlow · Nebius · Hyperbolic · dan lainnya

---

## 🛠️ CLI Tools yang Didukung

Claude Code · OpenClaw · Codex · OpenCode · Cursor · Antigravity · Cline · Continue · Roo · Copilot · Kilo Code · Droid · Grok Build · Devin CLI · DeepSeek TUI · Qwen Code · jcode · dan lainnya

---

## 📖 Setup Guide

### Konfigurasi Environment

Salin `.env.example` ke `.env`, sesuaikan:

```env
PORT=1945
HOSTNAME=0.0.0.0
NODE_ENV=production
JWT_SECRET=ganti-dengan-secret-aman
INITIAL_PASSWORD=merdeka
DATA_DIR=%APPDATA%\routermod
```

### PM2 Production

```bash
# Build + restart otomatis
node rebuild.js

# Cek status
pm2 status

# Log realtime
pm2 logs routermod
```

`ecosystem.config.js` menjalankan `.next/standalone/custom-server.js` dengan `NODE_ENV: production` dan `HOSTNAME: 0.0.0.0`.

### Tunneling Publik

1. Dashboard → Settings → Tunnel
2. Masukkan Cloudflare API Token + Zone ID + subdomain target
3. Klik **Enable** — Caddy + CF DNS dikonfigurasi otomatis
4. Subdomain tersimpan persisten, tidak berubah saat restart

### Menggunakan di CLI Tool

**Claude Code / OpenClaw / Cline:**
```json
{
  "baseUrl": "http://localhost:1945/v1",
  "apiKey": "sk-dari-dashboard"
}
```

**Codex:**
```bash
export OPENAI_BASE_URL="http://localhost:1945/v1"
export OPENAI_API_KEY="sk-dari-dashboard"
```

---

## 📊 Contoh Combo

**Zero biaya:**
```
1. kr/claude-sonnet-4.5   (Kiro free)
2. kr/glm-5               (GLM-5 via Kiro)
3. oc/<auto>              (OpenCode Free)
Biaya: Rp 0/bulan
```

**Maksimalkan subscription:**
```
1. cc/claude-opus-4-7     (Claude Code subscription)
2. glm/glm-5.1            ($0.6/1M token backup)
3. kr/claude-sonnet-4.5   (Kiro free fallback)
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

# List model
GET http://localhost:1945/v1/models
Authorization: Bearer <api-key>
```

---

## 🙏 Credits

RouterMod dibangun di atas:

- **[9Router](https://github.com/decolua/9router)** — upstream project, AI router + token saver
- **[RTK](https://github.com/rtk-ai/rtk)** — Rust token compression pipeline
- **[Caveman](https://github.com/JuliusBrussee/caveman)** — terse output prompt
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** — lazy senior dev prompt

---

## 📄 License

MIT — lihat [LICENSE](LICENSE) untuk detail.

---

<div align="center">
  <sub>Fork dari 9Router · UI Neobrutalism · Tunneling Otomatis · Port 1945</sub>
</div>
