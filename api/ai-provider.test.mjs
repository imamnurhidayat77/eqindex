// Unit: AI provider adapter (lib/aiProvider.js) and lib/ai.js on top of it.
// fetch is mocked — no network calls, no real keys.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { complete, resolveConfig, aiConfigured } = require('./src/lib/aiProvider.js');

const FAKE_KEY = 'test-key-not-real-123';
const TOOLS = [{ type: 'function', name: 'horses_search', description: 'Find horses', parameters: { type: 'object', properties: { q: { type: 'string' } } } }];
const AI_ENV = ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL', 'OPENCODE_GO_API_KEY', 'ZEN_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'];
let saved, realFetch, calls;

beforeEach(() => {
  saved = Object.fromEntries(AI_ENV.map((k) => [k, process.env[k]]));
  for (const k of AI_ENV) delete process.env[k];
  realFetch = globalThis.fetch;
  calls = [];
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  globalThis.fetch = realFetch;
});
// Reply with `json` and record the request.
const mockFetch = (json, status = 200) => {
  globalThis.fetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(json), { status, headers: { 'Content-Type': 'application/json' } });
  };
};

test('config: OpenCode Go stays the default and the old key still works', () => {
  const cfg = resolveConfig({ OPENCODE_GO_API_KEY: FAKE_KEY });
  assert.equal(cfg.name, 'opencode');
  assert.equal(cfg.model, 'muse-spark-1.3-contributor');
  assert.equal(cfg.baseUrl, 'https://opencode.ai/zen/go/v1');
  assert.equal(cfg.error, null);
  assert.equal(resolveConfig({ ZEN_API_KEY: FAKE_KEY }).error, null);
  assert.equal(resolveConfig({ AI_API_KEY: FAKE_KEY, AI_MODEL: 'other-model' }).model, 'other-model');
});

test('config: clear errors, never a guessed model', () => {
  assert.match(resolveConfig({}).error, /AI not configured — set AI_API_KEY \(or OPENCODE_GO_API_KEY \/ ZEN_API_KEY\)/);
  assert.match(resolveConfig({ AI_PROVIDER: 'openai', AI_API_KEY: FAKE_KEY }).error, /AI_MODEL is required for AI_PROVIDER=openai/);
  assert.match(resolveConfig({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: FAKE_KEY }).error, /AI_MODEL is required/);
  assert.match(resolveConfig({ AI_PROVIDER: 'openai-compatible', AI_API_KEY: FAKE_KEY, AI_MODEL: 'm' }).error, /AI_BASE_URL is required/);
  assert.match(resolveConfig({ AI_PROVIDER: 'nope', AI_API_KEY: FAKE_KEY }).error, /unknown AI_PROVIDER "nope"/);
  assert.equal(resolveConfig({ AI_PROVIDER: 'Anthropic', ANTHROPIC_API_KEY: FAKE_KEY }).error, null); // case-insensitive, model defaulted
  assert.equal(aiConfigured({ AI_PROVIDER: 'openai', AI_API_KEY: FAKE_KEY }), false);
});

test('opencode: Responses API, system inside input, session header, tool calls parsed', async () => {
  process.env.OPENCODE_GO_API_KEY = FAKE_KEY;
  mockFetch({ output: [{ type: 'function_call', name: 'horses_search', arguments: '{"q":"Bella"}' }, { content: [{ text: 'Looking it up' }] }] });
  const out = await complete({ system: 'SYS', prompt: 'User: hi', tools: TOOLS, maxTokens: 500, session: 's1' });
  const c = calls[0];
  assert.equal(c.url, 'https://opencode.ai/zen/go/v1/responses');
  assert.equal(c.headers.Authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(c.headers['x-opencode-session'], 's1');
  assert.equal(c.body.input, 'SYS\n\nUser: hi');
  assert.equal(c.body.max_output_tokens, 500);
  assert.equal(c.body.tools[0].name, 'horses_search');
  assert.deepEqual(out, { text: 'Looking it up', calls: [{ name: 'horses_search', args: '{"q":"Bella"}' }] });
});

test('anthropic: Messages API, system as its own field, tools as input_schema', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'anthropic', AI_API_KEY: FAKE_KEY });
  mockFetch({ content: [{ type: 'text', text: 'Hi' }, { type: 'tool_use', name: 'horses_search', input: { q: 'Bella' } }] });
  const out = await complete({ system: 'SYS', prompt: 'User: hi', tools: TOOLS, maxTokens: 20000 });
  const c = calls[0];
  assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(c.headers['x-api-key'], FAKE_KEY);
  assert.equal(c.headers['anthropic-version'], '2023-06-01');
  assert.equal(c.body.system, 'SYS');
  assert.deepEqual(c.body.messages, [{ role: 'user', content: 'User: hi' }]);
  assert.equal(c.body.max_tokens, 8000); // capped to the provider limit
  assert.deepEqual(c.body.tools[0].input_schema, TOOLS[0].parameters);
  assert.deepEqual(out, { text: 'Hi', calls: [{ name: 'horses_search', args: '{"q":"Bella"}' }] });
});

test('openai and openai-compatible: Chat Completions, system message, token field per flavour', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'openai', AI_API_KEY: FAKE_KEY, AI_MODEL: 'some-model' });
  mockFetch({ choices: [{ message: { content: 'Hi', tool_calls: [{ function: { name: 'horses_search', arguments: '{"q":"B"}' } }] } }] });
  const out = await complete({ system: 'SYS', prompt: 'P', tools: TOOLS, maxTokens: 300 });
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, `Bearer ${FAKE_KEY}`);
  assert.deepEqual(calls[0].body.messages, [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'P' }]);
  assert.equal(calls[0].body.max_completion_tokens, 300);
  assert.equal(calls[0].body.tools[0].function.name, 'horses_search');
  assert.deepEqual(out.calls, [{ name: 'horses_search', args: '{"q":"B"}' }]);

  Object.assign(process.env, { AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'https://llm.example.test/v1/' });
  mockFetch({ choices: [{ message: { content: 'ok' } }] });
  await complete({ prompt: 'P', maxTokens: 300 });
  assert.equal(calls[1].url, 'https://llm.example.test/v1/chat/completions'); // trailing slash trimmed
  assert.equal(calls[1].body.max_tokens, 300);
  assert.equal(calls[1].body.messages.length, 1); // no empty system message
});

test('gemini: generateContent, systemInstruction, native JSON mode, function calls', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'gemini', GEMINI_API_KEY: FAKE_KEY, AI_MODEL: 'some-gemini' });
  mockFetch({ candidates: [{ content: { parts: [{ text: '[]' }, { functionCall: { name: 'horses_search', args: { q: 'B' } } }] } }] });
  const out = await complete({ system: 'SYS', prompt: 'P', tools: TOOLS, maxTokens: 100, json: true });
  const c = calls[0];
  assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/models/some-gemini:generateContent');
  assert.equal(c.headers['x-goog-api-key'], FAKE_KEY);
  assert.deepEqual(c.body.systemInstruction, { parts: [{ text: 'SYS' }] });
  assert.equal(c.body.generationConfig.responseMimeType, 'application/json');
  assert.equal(c.body.tools[0].functionDeclarations[0].name, 'horses_search');
  assert.deepEqual(out, { text: '[]', calls: [{ name: 'horses_search', args: '{"q":"B"}' }] });
});

test('errors name the provider and never echo the key', async () => {
  Object.assign(process.env, { AI_PROVIDER: 'anthropic', AI_API_KEY: FAKE_KEY });
  globalThis.fetch = async () => new Response(`invalid key ${FAKE_KEY}`, { status: 401 });
  await assert.rejects(() => complete({ prompt: 'P' }), (e) => /anthropic 401/.test(e.message) && !e.message.includes(FAKE_KEY));
  delete process.env.AI_API_KEY;
  await assert.rejects(() => complete({ prompt: 'P' }), /AI not configured — set AI_API_KEY \(or ANTHROPIC_API_KEY\)/);
});

test('lib/ai works unchanged on any provider (map records + chat)', async () => {
  const { aiMapRecords, aiChat, aiAvailable } = require('./src/lib/ai.js');
  Object.assign(process.env, { AI_PROVIDER: 'anthropic', AI_API_KEY: FAKE_KEY });
  assert.equal(aiAvailable(), true);
  mockFetch({ content: [{ type: 'text', text: 'Here you go:\n```json\n[{"class_name":"Open 1.10m","rider_name":"Ann Lee","horse_name":"Dot","placing":"1"}]\n```' }] });
  const { records, dropped } = await aiMapRecords({ text: 'Open 1.10m\n1 Dot Ann Lee 1 60.1 0 0 0' });
  assert.deepEqual(records, [{ class_name: 'Open 1.10m', rider_name: 'Ann Lee', horse_name: 'Dot', placing: 1 }]);
  assert.equal(dropped, 0);

  mockFetch({ content: [{ type: 'text', text: 'Sure.' }] });
  const reply = await aiChat({ system: 'You are the import assistant.', messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(reply, 'Sure.');
  const chat = calls.at(-1);
  assert.equal(chat.body.system, 'You are the import assistant.');
  assert.match(chat.body.messages[0].content, /^User: hello\n\nAssistant:$/);
});
