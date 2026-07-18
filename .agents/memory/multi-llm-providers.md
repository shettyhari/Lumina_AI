---
name: Multi-LLM Provider Architecture
description: Per-user encrypted keys, provider routing by model ID prefix, 402 before SSE headers
---

# Multi-LLM Provider Architecture

The app uses per-user encrypted API keys. Provider routing is done by model ID prefix. The 402 status must be sent before SSE headers are written.

**Why:** SiOpenai does not exist in react-icons v5 (confirmed). Use a generic icon instead.

**How to apply:** When adding new LLM providers, follow the existing pattern in the gemini route. Never import SiOpenai from react-icons.

# Object Storage

- `@workspace/integrations-gemini-ai` exports: `ai` (client), `generateImage`, `batchProcess`, `batchProcessWithSSE`, `isRateLimitError`, `BatchOptions`. NOT `GoogleGenAI`.
- `storage.ts` template imports `RequestUploadUrlBody` and `RequestUploadUrlResponse` from `@workspace/api-zod` — these don't exist until codegen adds them to the OpenAPI spec. Patch the template to use manual validation instead.
- `customFetch` IS exported from `lib/api-client-react/src/index.ts` — but only after `export { ..., customFetch } from "./custom-fetch"` is added AND the package is rebuilt with `npx tsc --build`.
