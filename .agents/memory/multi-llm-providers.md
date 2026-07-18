---
name: Multi-LLM Provider Architecture
description: How multiple LLM providers (Gemini, OpenAI, Anthropic, OpenRouter) are integrated with per-user encrypted API keys
---

## Provider Routing

`artifacts/api-server/src/lib/modelRegistry.ts` defines all supported models. The provider is detected by model ID prefix:
- `gemini-*` → Gemini (built-in, uses Replit AI Integrations proxy — no user key needed)
- `gpt-*` / `o1` / `o3-*` → OpenAI (requires user key)
- `claude-*` → Anthropic (requires user key)
- `openrouter/*` → OpenRouter (requires user key, strip `openrouter/` prefix before calling API)

OpenRouter uses the OpenAI SDK with `baseURL: "https://openrouter.ai/api/v1"`.

**Why:** Keeps model routing centralized and extensible — add a new model by adding one entry to MODELS array.

**How to apply:** Any new model must be added to `modelRegistry.ts`. Frontend reads from `/api/models` endpoint so no frontend changes needed.

## API Key Storage

`lib/db/src/schema/userApiKeys.ts` — table `user_api_keys` with `(clerk_user_id, provider, encrypted_key)`.

Keys are AES-256-GCM encrypted using `SESSION_SECRET` via `artifacts/api-server/src/lib/crypto.ts`. The derived key uses `scryptSync` with a static salt `"lumina-api-keys-salt-v1"`.

**Why:** Keys are user data (they paid for them), must be encrypted at rest, and must be retrievable (not hashed) since we need to pass them to the provider SDK.

**How to apply:** Always use `encryptApiKey`/`decryptApiKey` from `crypto.ts`. Never store plaintext keys. The `SESSION_SECRET` env var must be set for this to work.

## Streaming Error for Missing Keys

When a user tries to use a non-Gemini model without an API key, the backend returns HTTP 402 (not SSE) before setting SSE headers. Frontend checks `response.status === 402` before reading the stream body, shows an inline error banner with a link to Settings.

**Why:** SSE can't carry HTTP error codes after the stream opens. The 402 check must happen before `setHeader("Content-Type", "text/event-stream")`.

## react-icons Icon Names

In react-icons v5, `SiOpenai` does NOT exist. Use `Bot` from lucide-react instead. Available SI icons for providers: `SiGoogle`, `SiAnthropic`, `SiOpenrouter`.
