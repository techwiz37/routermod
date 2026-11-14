# routermod

> AI Gateway & routing hub — satu pintu untuk semua provider AI (Claude, OpenAI, Gemini, DeepSeek, Grok, Ollama)

## Install & jalankan

```bash
npm install -g routermod
routermod
```

Buka **http://localhost:1337** — password default: `merdeka`

## Fitur

- 🔄 Multi-model routing (Claude, OpenAI, Gemini, DeepSeek, Grok, Ollama, dll)
- ⚡ Auto-failover ke provider cadangan
- 💾 Database SQLite lokal
- 📊 Dashboard monitoring realtime
- 🔑 Support API key & OAuth (OIDC/SAML)

## Konfigurasi

Server berjalan di port `1337` secara default. Ubah via environment variable:

```bash
PORT=3000 routermod
```

## Sumber

[github.com/techwiz37/routermod](https://github.com/techwiz37/routermod)
