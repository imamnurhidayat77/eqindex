// One adapter for every AI provider the Import Assistant can use, so a
// switch is env config only (see api/README.md → "AI provider"):
//   AI_PROVIDER = opencode (default) | anthropic | openai | gemini | openai-compatible
//   AI_API_KEY, AI_MODEL, AI_BASE_URL (optional overrides)
// OPENCODE_GO_API_KEY / ZEN_API_KEY keep working for the default provider.
// Callers (lib/ai.js) speak one shape: complete({ system, prompt, tools, maxTokens,
// session, json }) → { text, calls: [{ name, args (JSON string) }] }.
// Files are never sent: the browser extracts PDF text first, so every
// provider receives plain text. Keys never appear in errors or logs.

const UA = 'eqindex-import/1.0';
const ERROR_SNIPPET = 160;

// Per-provider defaults. A model is only defaulted where the id is known to
// be current; others must set AI_MODEL (clear error instead of a guess).
// maxPromptChars / maxOutputTokens: how much text one request may carry.
const PROVIDERS = {
  opencode: {
    baseUrl: 'https://opencode.ai/zen/go/v1', model: 'muse-spark-1.3-contributor',
    keyEnv: ['OPENCODE_GO_API_KEY', 'ZEN_API_KEY'], maxPromptChars: 15000, maxOutputTokens: 8000,
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5',
    keyEnv: ['ANTHROPIC_API_KEY'], maxPromptChars: 60000, maxOutputTokens: 8000,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1', model: null,
    keyEnv: ['OPENAI_API_KEY'], maxPromptChars: 60000, maxOutputTokens: 8000,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: null,
    keyEnv: ['GEMINI_API_KEY'], maxPromptChars: 60000, maxOutputTokens: 8000,
  },
  // Any server speaking the OpenAI Chat Completions API (OpenRouter, Groq,
  // Together, a self-hosted vLLM…): base URL and model are always required.
  'openai-compatible': {
    baseUrl: null, model: null, keyEnv: [], maxPromptChars: 15000, maxOutputTokens: 8000,
  },
};

// Resolve the active provider from env (read on every call so a config
// change needs no code change and tests can switch providers).
function resolveConfig(env = process.env) {
  const name = String(env.AI_PROVIDER || 'opencode').trim().toLowerCase();
  const def = PROVIDERS[name];
  if (!def) return { name, error: `unknown AI_PROVIDER "${name}" (use ${Object.keys(PROVIDERS).join(', ')})` };
  const key = env.AI_API_KEY || def.keyEnv.map((k) => env[k]).find(Boolean) || '';
  const model = env.AI_MODEL || def.model;
  const baseUrl = String(env.AI_BASE_URL || def.baseUrl || '').replace(/\/+$/, '');
  let error = null;
  if (!key) error = `AI not configured — set AI_API_KEY${def.keyEnv.length ? ` (or ${def.keyEnv.join(' / ')})` : ''} on the API service`;
  else if (!model) error = `AI_MODEL is required for AI_PROVIDER=${name}`;
  else if (!baseUrl) error = `AI_BASE_URL is required for AI_PROVIDER=${name}`;
  return { name, key, model, baseUrl, maxPromptChars: def.maxPromptChars, maxOutputTokens: def.maxOutputTokens, error };
}

// Tool definitions are written once (Responses-API style: {type, name,
// description, parameters}); each provider gets its own shape.
const toolSpec = (t) => ({ name: t.name, description: t.description || '', parameters: t.parameters || { type: 'object', properties: {} } });

const ADAPTERS = {
  // OpenCode Go: OpenAI Responses API. The system prompt travels inside the
  // input text (unchanged behaviour from before this adapter existed).
  opencode: {
    request(cfg, { system, prompt, tools, maxTokens, session }) {
      const body = { model: cfg.model, input: system ? `${system}\n\n${prompt}` : prompt, reasoning: { effort: 'low' }, max_output_tokens: maxTokens };
      if (tools?.length) body.tools = tools.map((t) => ({ type: 'function', ...toolSpec(t) }));
      return {
        url: `${cfg.baseUrl}/responses`,
        headers: { Authorization: `Bearer ${cfg.key}`, 'x-opencode-session': session || `ai-${Date.now().toString(36)}` },
        body,
      };
    },
    parse(j) {
      let text = typeof j.output_text === 'string' ? j.output_text : '';
      const calls = [];
      const parts = [];
      for (const item of j.output || []) {
        if (item.type === 'function_call' && item.name) calls.push({ name: item.name, args: item.arguments || '{}' });
        for (const c of item.content || []) if (typeof c.text === 'string') parts.push(c.text);
      }
      if (!text) text = parts.join('\n');
      return { text, calls };
    },
  },
  // Anthropic Messages API: system prompt is its own field.
  anthropic: {
    request(cfg, { system, prompt, tools, maxTokens }) {
      const body = { model: cfg.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] };
      if (system) body.system = system;
      if (tools?.length) body.tools = tools.map((t) => { const s = toolSpec(t); return { name: s.name, description: s.description, input_schema: s.parameters }; });
      return { url: `${cfg.baseUrl}/messages`, headers: { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, body };
    },
    parse(j) {
      const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
      const calls = (j.content || []).filter((b) => b.type === 'tool_use' && b.name)
        .map((b) => ({ name: b.name, args: JSON.stringify(b.input || {}) }));
      return { text, calls };
    },
  },
  // OpenAI Chat Completions (also the shape of every "OpenAI-compatible" server).
  openai: {
    request(cfg, { system, prompt, tools, maxTokens }, { compatible = false } = {}) {
      const messages = [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }];
      const body = { model: cfg.model, messages };
      // OpenAI's newer models only accept max_completion_tokens; compatible
      // servers mostly still expect max_tokens.
      body[compatible ? 'max_tokens' : 'max_completion_tokens'] = maxTokens;
      if (tools?.length) body.tools = tools.map((t) => ({ type: 'function', function: toolSpec(t) }));
      return { url: `${cfg.baseUrl}/chat/completions`, headers: { Authorization: `Bearer ${cfg.key}` }, body };
    },
    parse(j) {
      const msg = j.choices?.[0]?.message || {};
      const text = typeof msg.content === 'string' ? msg.content
        : (msg.content || []).map((p) => p.text || '').join('\n');
      const calls = (msg.tool_calls || []).filter((c) => c.function?.name)
        .map((c) => ({ name: c.function.name, args: c.function.arguments || '{}' }));
      return { text, calls };
    },
  },
  // Google Gemini generateContent. JSON mode is native (arrays allowed).
  gemini: {
    request(cfg, { system, prompt, tools, maxTokens, json }) {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (tools?.length) body.tools = [{ functionDeclarations: tools.map(toolSpec) }];
      return {
        url: `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent`,
        headers: { 'x-goog-api-key': cfg.key },
        body,
      };
    },
    parse(j) {
      const parts = j.candidates?.[0]?.content?.parts || [];
      const text = parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('\n');
      const calls = parts.filter((p) => p.functionCall?.name)
        .map((p) => ({ name: p.functionCall.name, args: JSON.stringify(p.functionCall.args || {}) }));
      return { text, calls };
    },
  },
};

// The one call ai.js makes. json: the caller expects a JSON payload (only
// providers with a native JSON mode that allows arrays use it).
async function complete({ system = '', prompt, tools, maxTokens = 3000, session, json = false }, env = process.env) {
  const cfg = resolveConfig(env);
  if (cfg.error) throw new Error(cfg.error);
  const compatible = cfg.name === 'openai-compatible';
  const adapter = ADAPTERS[compatible ? 'openai' : cfg.name];
  const req = adapter.request(cfg, { system, prompt, tools, maxTokens: Math.min(maxTokens, cfg.maxOutputTokens), session, json }, { compatible });
  const res = await fetch(req.url, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/json', ...req.headers },
    body: JSON.stringify(req.body),
  });
  if (!res.ok) {
    const t = (await res.text().catch(() => '')).split(cfg.key).join('[key]');
    throw new Error(`AI request failed (${cfg.name} ${res.status}) ${t.slice(0, ERROR_SNIPPET)}`);
  }
  const { text, calls } = adapter.parse(await res.json());
  return { text: String(text || '').trim(), calls };
}

const aiConfigured = (env = process.env) => !resolveConfig(env).error;
const promptLimit = (env = process.env) => resolveConfig(env).maxPromptChars || PROVIDERS.opencode.maxPromptChars;

module.exports = { complete, resolveConfig, aiConfigured, promptLimit, PROVIDERS };
