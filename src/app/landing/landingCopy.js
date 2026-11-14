// Landing-page copy. Kept separate from the dashboard's literal map because the
// landing voice is intentionally casual (ngobrol, bukan formal) and it must
// switch instantly without a page reload.
//
// `en` is the default. Every key must exist in both locales.

export const LANDING_LOCALES = ["en", "id"];

export const LANDING_LOCALE_NAMES = {
  id: "Indonesia",
  en: "English",
};

export const LANDING_COPY = {
  id: {
    // nav
    navFeatures: "Fitur",
    navHow: "Cara Kerja",
    navStart: "Mulai",
    navInstall: "Install",
    navLogin: "Masuk",
    navMenu: "Menu",
    navOpen: "Buka menu",
    navClose: "Tutup menu",
    navHome: "Ke beranda",
    navSection: "Navigasi",
    navResources: "Sumber Daya",

    // hero
    heroBadge: "siap dipakai",
    heroTitle1: "Satu Endpoint buat",
    heroTitle2: "Semua Provider AI",
    heroDesc:
      "RouterMod itu gateway AI yang jalan di server kamu sendiri. Routing pintar, failover otomatis, kuota per kunci, dan pantauan lengkap — tanpa perlu ubah kode klien.",
    heroCtaLogin: "Masuk",
    heroCtaInstall: "Install",
    statProviders: "Provider",
    statEndpoint: "Endpoint",
    statNoCode: "Tanpa ubah kode",

    // hero panel
    panelLive: "gateway · live",
    panelClient: "klien",
    panelGateway: "gateway",
    panelProvider: "provider",
    panelLatency: "Latensi",
    panelRpm: "Req/menit",
    panelUptime: "Uptime",

    // how it works
    howEyebrow: "Cara Kerja",
    howTitle: "Tiga langkah, satu jalur",
    howDesc:
      "Dari klien kamu sampai provider tujuan, semuanya lewat satu lapisan yang gampang dipantau.",
    howStep: "Langkah",
    how1Title: "Klien & SDK",
    how1Desc:
      "Arahin base URL klien OpenAI-compatible ke endpoint lokal. Nggak perlu ubah kode.",
    how2Title: "Gateway RouterMod",
    how2Desc:
      "Permintaan dicek, kredensial dipilih, rutenya ditentukan dari kondisi akun dan sisa kuota.",
    how3Title: "Provider AI",
    how3Desc:
      "Diteruskan ke provider yang paling siap. Kalau gagal, otomatis pindah ke yang lain.",

    // features
    featEyebrow: "Fitur",
    featTitle: "Dibikin buat produksi",
    featDesc: "Semua yang kamu butuh buat jalanin gateway AI multi-provider.",
    feat1Title: "Routing Pintar",
    feat1Desc: "Combo, fallback berlapis, dan Smart Router milih model paling pas tiap request.",
    feat2Title: "Failover Otomatis",
    feat2Desc: "Akun kena limit atau mati langsung dilewatin. Request tetap jalan.",
    feat3Title: "Kunci & Kuota",
    feat3Desc: "Kuota token, batas biaya, rate limit, dan concurrency per kunci API.",
    feat4Title: "Pantauan Lengkap",
    feat4Desc: "Request live, token kepakai, biaya, dan log per provider di satu dasbor.",
    feat5Title: "Self-Hosted",
    feat5Desc: "Data dan kredensial tetap di server kamu. Nggak lewat pihak ketiga.",
    feat6Title: "Kompatibel CLI",
    feat6Desc: "Claude Code, Codex, Cline, Cursor, Roo, Copilot, dan klien OpenAI-compatible.",
    feat7Title: "150+ Provider",
    feat7Desc: "OpenAI, Anthropic, Gemini, DeepSeek, Grok, Ollama, dan masih banyak lagi.",
    feat8Title: "Kontrol Penuh",
    feat8Desc: "System prompt, prefix model, ubah parameter, dan proxy per koneksi.",

    // get started
    startEyebrow: "Mulai",
    startTitle: "Nyala dalam hitungan detik",
    startDesc:
      "Install RouterMod, sambungin provider lewat dasbor, terus arahin klien kamu ke endpoint.",
    start1Title: "Jalanin server",
    start1Desc: "Satu perintah, gateway langsung nyala.",
    start2Title: "Sambungin provider",
    start2Desc: "Tambah kredensial lewat dasbor.",
    start3Title: "Arahin klien",
    start3Desc: "Pakai base URL endpoint di tool kamu.",
    termBooting: "Nyalain RouterMod...",
    termRunning: "Server jalan di",
    termDashboard: "Dasbor:",
    termReady: "Siap nerima request ✓",
    termEndpoint: "Endpoint:",
    termData: "Data:",
    termCopy: "salin",
    termCopied: "tersalin",

    // closing cta
    ctaTitle: "Siap bikin infrastruktur AI kamu lebih simpel?",
    ctaDesc:
      "Satu endpoint buat semua provider. Atur kunci, pantau pemakaian, dan scale tanpa nyentuh kode klien.",
    ctaLogin: "Masuk ke Dashboard",
    ctaInstall: "Install",

    // footer
    footDesc:
      "Gateway AI self-hosted — satu endpoint buat semua provider, lengkap dengan routing, kuota, dan pantauan.",
    footProduct: "Produk",
    footResources: "Sumber Daya",
    footCommunity: "Komunitas",
    footFeatures: "Fitur",
    footHow: "Cara Kerja",
    footStart: "Mulai",
    footDashboard: "Dashboard",
    footDocs: "Dokumentasi",
    footChangelog: "Changelog",
    footBug: "Lapor Bug",
    footTelegram: "Telegram",
    footWhatsApp: "WhatsApp",
    footGitHub: "GitHub",
    footAllOk: "Semua sistem normal",
    footBy: "Dibikin oleh Techwiz",

    // preloader
    loading: "Memuat...",
  },

  en: {
    navFeatures: "Features",
    navHow: "How it Works",
    navStart: "Get Started",
    navInstall: "Install",
    navLogin: "Sign in",
    navMenu: "Menu",
    navOpen: "Open menu",
    navClose: "Close menu",
    navHome: "Go to home",
    navSection: "Navigation",
    navResources: "Resources",

    heroBadge: "ready to use",
    heroTitle1: "One Endpoint for",
    heroTitle2: "Every AI Provider",
    heroDesc:
      "RouterMod is an AI gateway that runs on your own server. Smart routing, automatic failover, per-key quotas, and full observability — no client code changes.",
    heroCtaLogin: "Sign in",
    heroCtaInstall: "Install",
    statProviders: "Providers",
    statEndpoint: "Endpoint",
    statNoCode: "No code change",

    panelLive: "gateway · live",
    panelClient: "client",
    panelGateway: "gateway",
    panelProvider: "provider",
    panelLatency: "Latency",
    panelRpm: "Req/min",
    panelUptime: "Uptime",

    howEyebrow: "How it Works",
    howTitle: "Three steps, one path",
    howDesc:
      "From your client to the target provider, everything goes through one layer you can watch.",
    howStep: "Step",
    how1Title: "Client & SDK",
    how1Desc:
      "Point your OpenAI-compatible client's base URL at the local endpoint. No code changes.",
    how2Title: "RouterMod Gateway",
    how2Desc:
      "The request is checked, credentials are picked, and the route is chosen from account health and remaining quota.",
    how3Title: "AI Provider",
    how3Desc:
      "Forwarded to the provider that is most ready. If it fails, it moves to the next one automatically.",

    featEyebrow: "Features",
    featTitle: "Built for production",
    featDesc: "Everything you need to run a multi-provider AI gateway.",
    feat1Title: "Smart Routing",
    feat1Desc: "Combos, layered fallback, and Smart Router pick the best model per request.",
    feat2Title: "Automatic Failover",
    feat2Desc: "Limited or dead accounts are skipped instantly. Requests keep flowing.",
    feat3Title: "Keys & Quotas",
    feat3Desc: "Token quota, spend cap, rate limit, and concurrency per API key.",
    feat4Title: "Full Observability",
    feat4Desc: "Live requests, tokens used, cost, and per-provider logs in one dashboard.",
    feat5Title: "Self-Hosted",
    feat5Desc: "Your data and credentials stay on your server. No third parties.",
    feat6Title: "CLI Compatible",
    feat6Desc: "Claude Code, Codex, Cline, Cursor, Roo, Copilot, and OpenAI-compatible clients.",
    feat7Title: "150+ Providers",
    feat7Desc: "OpenAI, Anthropic, Gemini, DeepSeek, Grok, Ollama, and many more.",
    feat8Title: "Full Control",
    feat8Desc: "System prompts, model prefixes, parameter transforms, and per-connection proxy.",

    startEyebrow: "Get Started",
    startTitle: "Live in seconds",
    startDesc:
      "Install RouterMod, connect providers from the dashboard, then point your client at the endpoint.",
    start1Title: "Run the server",
    start1Desc: "One command and the gateway is up.",
    start2Title: "Connect providers",
    start2Desc: "Add credentials from the dashboard.",
    start3Title: "Point your client",
    start3Desc: "Use the endpoint base URL in your tool.",
    termBooting: "Starting RouterMod...",
    termRunning: "Server running at",
    termDashboard: "Dashboard:",
    termReady: "Ready for requests ✓",
    termEndpoint: "Endpoint:",
    termData: "Data:",
    termCopy: "copy",
    termCopied: "copied",

    ctaTitle: "Ready to make your AI stack simpler?",
    ctaDesc:
      "One endpoint for every provider. Manage keys, watch usage, and scale without touching client code.",
    ctaLogin: "Open Dashboard",
    ctaInstall: "Install",

    footDesc:
      "Self-hosted AI gateway — one endpoint for every provider, with routing, quotas, and observability built in.",
    footProduct: "Product",
    footResources: "Resources",
    footCommunity: "Community",
    footFeatures: "Features",
    footHow: "How it Works",
    footStart: "Get Started",
    footDashboard: "Dashboard",
    footDocs: "Documentation",
    footChangelog: "Changelog",
    footBug: "Report a Bug",
    footTelegram: "Telegram",
    footWhatsApp: "WhatsApp",
    footGitHub: "GitHub",
    footAllOk: "All systems normal",
    footBy: "Built by Techwiz",

    loading: "Loading...",
  },
};
