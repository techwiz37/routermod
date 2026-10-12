const API_BASE = "http://127.0.0.1:1945";

async function seed() {
  console.log("Logging in...");
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "merdeka" }),
  });

  const cookie = loginRes.headers.get("set-cookie") || "";
  console.log("Logged in:", loginRes.status);

  // Check existing connections
  const listRes = await fetch(`${API_BASE}/api/providers`, {
    headers: { cookie },
  });
  const listData = await listRes.json();
  console.log("Existing connections:", listData.connections?.length || 0);

  const fakeProviders = [
    {
      provider: "openai",
      name: "OpenAI GPT-4o Production",
      apiKey: "sk-proj-demo-live-openai-prod-001",
      testStatus: "active",
      priority: 1,
    },
    {
      provider: "openai",
      name: "OpenAI Backup O1-Preview",
      apiKey: "sk-proj-demo-backup-openai-002",
      testStatus: "active",
      priority: 2,
    },
    {
      provider: "anthropic",
      name: "Claude 3.5 Sonnet Main",
      apiKey: "sk-ant-api03-live-claude-35-sonnet",
      testStatus: "active",
      priority: 1,
    },
    {
      provider: "anthropic",
      name: "Claude Haiku Failover",
      apiKey: "sk-ant-api03-failover-haiku",
      testStatus: "active",
      priority: 2,
    },
    {
      provider: "google",
      name: "Gemini 1.5 Pro Flash",
      apiKey: "AIzaSyDemoGoogleGeminiLiveKey99",
      testStatus: "active",
      priority: 1,
    },
    {
      provider: "deepseek",
      name: "DeepSeek V3 / R1 Reasoner",
      apiKey: "sk-deepseek-live-reasoning-01",
      testStatus: "active",
      priority: 1,
    },
    {
      provider: "xai",
      name: "Grok 2 Beta Dev",
      apiKey: "xai-demo-grok2-invalid-quota-err",
      testStatus: "failed",
      priority: 1,
    },
    {
      provider: "groq",
      name: "Groq Llama-3.3 70B Fast",
      apiKey: "gsk_demo_rate_limit_inactive_003",
      testStatus: "failed",
      priority: 1,
    },
  ];

  for (const p of fakeProviders) {
    const res = await fetch(`${API_BASE}/api/providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(p),
    });
    const result = await res.json();
    console.log(`Added ${p.name}:`, res.status, result.connection?.id ? "OK" : result.error);
  }
}

seed().catch(console.error);
