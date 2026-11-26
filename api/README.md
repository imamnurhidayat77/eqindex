# EQIndex API

## AI provider (Import Assistant)

The Import Assistant uses AI only for result files the deterministic readers
(Equipe links, CSV with known headers, EvoEvents PDFs) cannot map, and for
its chat. Every AI-mapped row still goes through Validate (dry run) and a
human Commit.

The provider is **env config only** (Cloud Run service `eqindex-api`). All
provider differences live in `src/lib/aiProvider.js`; nothing else changes
when you switch.

| Variable | Required | Meaning |
| --- | --- | --- |
| `AI_PROVIDER` | no | `opencode` (default), `anthropic`, `openai`, `gemini`, `openai-compatible` |
| `AI_API_KEY` | yes* | API key for the chosen provider |
| `AI_MODEL` | depends | Model id. Defaulted only for `opencode` and `anthropic` |
| `AI_BASE_URL` | depends | API base URL. Required for `openai-compatible`; optional override otherwise |

\* For backwards compatibility the default provider also accepts the existing
`OPENCODE_GO_API_KEY` (or `ZEN_API_KEY`); `anthropic`, `openai` and `gemini`
also accept `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`.
`AI_API_KEY` wins when both are set.

### What to set per provider

| Provider | Set | Defaults used when unset |
| --- | --- | --- |
| OpenCode Go (current) | nothing new — `OPENCODE_GO_API_KEY` keeps working | base `https://opencode.ai/zen/go/v1`, model `muse-spark-1.3-contributor` |
| Anthropic | `AI_PROVIDER=anthropic`, `AI_API_KEY` | base `https://api.anthropic.com/v1`, model `claude-sonnet-5-5` |
| OpenAI | `AI_PROVIDER=openai`, `AI_API_KEY`, `AI_MODEL` | base `https://api.openai.com/v1` |
| Google Gemini | `AI_PROVIDER=gemini`, `AI_API_KEY`, `AI_MODEL` | base `https://generativelanguage.googleapis.com/v1beta` |
| OpenAI-compatible (OpenRouter, Groq, Together, vLLM…) | `AI_PROVIDER=openai-compatible`, `AI_API_KEY`, `AI_MODEL`, `AI_BASE_URL` (e.g. `https://openrouter.ai/api/v1`) | — |

Put keys in Secret Manager / Cloud Run secrets, never in git or logs.
Example switch (values in angle brackets are yours):

```
gcloud run services update eqindex-api --project eqindex --region asia-southeast2 \
  --update-env-vars AI_PROVIDER=anthropic \
  --update-secrets AI_API_KEY=<secret-name>:latest
```

Rollback = remove `AI_PROVIDER` / `AI_API_KEY` (falls back to OpenCode Go).

### How providers differ (handled in `aiProvider.js`)

| | OpenCode Go | Anthropic | OpenAI / compatible | Gemini |
| --- | --- | --- | --- | --- |
| API | Responses (`/responses`) | Messages (`/messages`) | Chat Completions (`/chat/completions`) | `models/<model>:generateContent` |
| System prompt | inside the input text | `system` field | `system` message | `systemInstruction` |
| Auth header | `Authorization: Bearer` | `x-api-key` + `anthropic-version` | `Authorization: Bearer` | `x-goog-api-key` |
| Tools (chat lookups) | function tools | `input_schema` tools | `tools[].function` | `functionDeclarations` |
| JSON output | prompt contract + tolerant parser | same | same | native JSON mode + parser |
| Prompt budget (chars) | 15 000 | 60 000 | 60 000 / 15 000 | 60 000 |
| Max output tokens | 8 000 | 8 000 | 8 000 | 8 000 |

- **Files:** no provider receives files. The browser extracts PDF text first
  (`web/app/admin/assistant/page.jsx`), so every provider gets plain text.
- **Output:** the mapper asks for one JSON array; the parser tolerates code
  fences, prose around the JSON and `{records: [...]}` wrappers, so models
  without a JSON mode work too.
- Errors name the provider and status (e.g. `AI request failed (anthropic 401)`)
  and never contain the key. A missing key or model gives a plain message in
  the Assistant instead of a crash.

Tests: `ai-provider.test.mjs` (mocked fetch, no network, no real keys), run by
`npm test`.
