const fs = require('fs');
const http = require('http');
const path = require('path');

const configPath = path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.config',
  'opencode',
  'opencode.json'
);

const knownNames = {
  'auto-thinking': 'Auto Router (Thinking)',
  'claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'claude-haiku-4.5': 'Claude Haiku 4.5',
  'deepseek-3.2-thinking': 'DeepSeek 3.2 (Thinking)',
  'deepseek-3.2-agentic': 'DeepSeek 3.2 (Agentic)',
  'deepseek-3.2-thinking-agentic': 'DeepSeek 3.2 (Thinking + Agentic)',
  'minimax-m2.5': 'MiniMax M2.5',
  'minimax-m2.5-thinking': 'MiniMax M2.5 (Thinking)',
  'minimax-m2.5-agentic': 'MiniMax M2.5 (Agentic)',
  'minimax-m2.5-thinking-agentic': 'MiniMax M2.5 (Thinking + Agentic)',
  'minimax-m2.1': 'MiniMax M2.1',
  'minimax-m2.1-thinking': 'MiniMax M2.1 (Thinking)',
  'minimax-m2.1-agentic': 'MiniMax M2.1 (Agentic)',
  'minimax-m2.1-thinking-agentic': 'MiniMax M2.1 (Thinking + Agentic)',
  'glm-5-thinking': 'GLM 5 (Thinking)',
  'glm-5-agentic': 'GLM 5 (Agentic)',
  'glm-5-thinking-agentic': 'GLM 5 (Thinking + Agentic)',
  'qwen3-coder-next-thinking': 'Qwen3 Coder Next (Thinking)',
  'qwen3-coder-next-agentic': 'Qwen3 Coder Next (Agentic)',
  'qwen3-coder-next-thinking-agentic': 'Qwen3 Coder Next (Thinking + Agentic)',
  'gemini-3.8-flash': 'Gemini 3.8 Flash',
  'gemini-3.7-flash': 'Gemini 3.7 Flash',
  'gemini-3.6-flash': 'Gemini 3.6 Flash',
  'gemini-pro-agent': 'Gemini 3.1 Pro (Agent)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-opus-4-6-thinking': 'Claude Opus 4.6 (Thinking)',
  'beam-free': 'Beam Free',
  'flint-40b-free': 'Flint 40B Free',
  'nemotron-3.5-super-vl-free': 'Nemotron 3.5 Super VL Free',
  'glm-5.3-flash-free': 'GLM 5.3 Flash Free',
  'space-bunny-free': 'Space Bunny Free',
  'step-5-preview-free': 'Step 5 Preview Free',
};

function resolveModelDisplayName(m) {
  const parts = m.id.split('/');
  const prefix = parts.length > 1 ? parts[0] : (m.owned_by || 'rmod');
  const slug = parts.length > 1 ? parts[1] : m.id;

  let baseName = m.name;
  if (knownNames[slug]) {
    baseName = knownNames[slug];
  } else if (knownNames[m.name]) {
    baseName = knownNames[m.name];
  } else if (m.name && m.name !== slug && m.name !== m.id) {
    baseName = m.name;
  } else {
    baseName = slug.split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
  }

  if (baseName.startsWith(`(${prefix}) `)) {
    return baseName;
  }
  return `(${prefix}) ${baseName}`;
}

http.get('http://127.0.0.1:1337/v1/models', {
  headers: { Authorization: 'Bearer rmod-xggfk3iu' },
}, (res) => {
  let raw = '';
  res.on('data', (chunk) => (raw += chunk));
  res.on('end', () => {
    try {
      const apiData = JSON.parse(raw);
      if (!apiData?.data || !Array.isArray(apiData.data)) {
        console.error('Invalid response from routermod:', raw);
        process.exit(1);
      }

      let config = {};
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }

      if (!config.provider) config.provider = {};
      const providerKey = 'Routermod';
      if (!config.provider[providerKey]) {
        config.provider[providerKey] = {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://127.0.0.1:1337/v1',
            apiKey: 'rmod-xggfk3iu',
          },
          models: {},
        };
      }

      const modelsObj = {};
      for (const m of apiData.data) {
        const displayName = resolveModelDisplayName(m);
        const hasVision = !(m.capabilities && m.capabilities.vision === false);
        modelsObj[m.id] = {
          name: displayName,
          modalities: {
            input: hasVision ? ['text', 'image'] : ['text'],
            output: ['text'],
          },
        };
      }

      config.provider[providerKey].models = modelsObj;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`Berhasil menyinkronkan ${Object.keys(modelsObj).length} model ke OpenCode config (${configPath}).`);
    } catch (err) {
      console.error('Error saat update config:', err);
    }
  });
}).on('error', (err) => {
  console.error('Gagal menghubungkan ke Routermod:', err.message);
});
