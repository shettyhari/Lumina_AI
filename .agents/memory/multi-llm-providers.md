---
name: Multi-LLM Provider Architecture
description: Per-user encrypted keys, provider routing by model ID prefix, 402 before SSE headers, icon pitfalls, schema naming conventions
---

## Provider routing
- `gemini-*` → built-in Gemini via `@workspace/integrations-gemini-ai`
- `gpt-*` → OpenAI (user API key required)
- `claude-*` → Anthropic (user API key required)
- `openrouter/*` → OpenRouter (user API key required)
- If paid provider and no key: return HTTP 402 JSON **before** setting SSE headers

## Image generation
- Correct model: `"gemini-2.0-flash-preview-image-generation"` (NOT `"gemini-2.5-flash-image"`)
- Uses `Modality.TEXT` + `Modality.IMAGE` response modalities

## API key storage
- AES-256-GCM encryption via `artifacts/api-server/src/lib/crypto.ts`
- Endpoint: `POST /api/user/api-keys` with body `{ provider, key }` (changed from `PUT /user/api-keys/:provider`)
- Schema names after codegen: `SetUserApiKeyBody`, `SetUserApiKeyResponse` (NOT `Upsert*`)

## Frontend icons
- `SiOpenai` does NOT exist in react-icons v5 → use `Bot` from lucide-react
- `SiAnthropic`, `SiGoogle` do exist in react-icons v5

## API server build
- Uses esbuild bundler — cannot import `zod` or `zod/v4` directly in route files
- All schema validation must use `@workspace/api-zod` schemas or inline plain JS validation
- Zod schemas in routes cause "Could not resolve" build errors

## Codegen
- OpenAPI spec lives in `lib/api-spec/openapi.yaml`
- Run codegen: `cd lib/api-spec && pnpm run codegen`
- Generates both `@workspace/api-zod` (Zod schemas) and `@workspace/api-client-react` (React Query hooks)
- After codegen, route imports must match newly generated schema names exactly

## Memory + Persona injection
- AI memories injected into every chat's system prompt server-side (backend handles it)
- Active persona's systemPrompt is the base; memories appended as `[User Memory]\n1. ...`
- DB tables: `ai_memories` (clerkUserId, content), `ai_personas` (clerkUserId, name, emoji, systemPrompt, isDefault)

## Vision (image in chat)
- Frontend: FileReader converts image → base64; POST sends `imageBase64` (bare base64, no prefix) + `imageMimeType`
- Backend: reassembles `data:<mime>;base64,<data>` for storage; passes `inlineData` to Gemini API

**Why:** Gemini's native image input requires `inlineData` format; OpenAI uses `image_url` with full data URL
