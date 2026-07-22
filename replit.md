# Lumina AI — Personal AI Assistant

A fully-featured household-operations platform and personal AI assistant. Features include real-time LLM streaming, image generation, a multi-module family dashboard (budget, bills, meals, chores, pets, documents, cloud storage, calendar, and more), and an agentic assistant ("Lina") that can take real actions via tool-calling.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ai-assistant run dev` — run the frontend (port from `$PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind v4, shadcn/ui, Wouter routing, Framer Motion
- Auth: Clerk (Google OAuth + email/password), via `@clerk/react` + `@clerk/express`
- AI: Gemini (default), OpenAI, and Anthropic — multi-provider, per-user encrypted API keys
- DB: PostgreSQL + Drizzle ORM
- API: Express 5 with SSE streaming for chat

## Where things live

- `artifacts/ai-assistant/` — React + Vite frontend
- `artifacts/api-server/` — Express 5 API server
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod validation schemas
- `lib/db/src/schema/` — Drizzle table definitions
- `lib/integrations-gemini-ai/` — Gemini AI SDK client + image/batch helpers

## App modules

- **Chat / Lina** — real-time streaming AI with tool-calling, conversation history, model selector, web search (Gemini grounding)
- **Image Generation** — text-to-image with Gemini Flash Image model
- **Dashboard** — stats, pinned threads, recent activity, daily digest
- **Memory & Personas** — per-user AI memories and persona profiles
- **Family** — member management, roles (admin/member), admin-approval onboarding
- **Budget & Bills** — budget categories, transactions, bill tracking
- **Meals & Pantry** — meal planning, pantry/inventory tracking, shopping list
- **Chores & Rewards** — task assignment, completion, reward system
- **Calendar & Reminders** — custom calendar, reminder scheduling
- **Documents** — file upload and management
- **Cloud Storage** — Google Drive OAuth integration
- **Notes** — personal notes
- **Emergency** — emergency contacts and info
- **Pets & Maintenance** — pet records, home maintenance tracking
- **Wishlist & Inventory** — personal wishlists, household inventory
- **Settings** — display name, preferred model, system prompt, theme, API key management

## Access control

- First user to sign up becomes **admin** and is auto-approved.
- All subsequent users are created with `status: "pending"` and must be approved by an admin via the Admin panel before accessing any feature.
- The admin-assignment is wrapped in a transaction to prevent race conditions.
- `artifacts/api-server/src/middlewares/requireApproved.ts` — enforces approved status on every protected route

## Security

- CORS locked to known frontend origins (`REPLIT_DEV_DOMAIN` and optional `FRONTEND_ORIGIN` env var)
- Security headers via `helmet()`
- Rate limiting on chat (`aiRateLimit`: 30 req/min/user) and image-gen (`imageGenRateLimit`: 5 req/min/user) — `artifacts/api-server/src/middlewares/rateLimiter.ts`
- Google Drive OAuth state tokens use strict `SESSION_SECRET` (throws if not set, no fallback)
- Per-user API keys encrypted with AES-256-GCM (key derived from `SESSION_SECRET` via scrypt)
- Global Express error handler in `app.ts` prevents stack traces leaking in API responses

## Architecture decisions

- SSE streaming for chat: uses `fetch + ReadableStream` on the client since `EventSource` only supports GET
- Conversations scoped by `clerkUserId` — users only see their own data
- User profiles auto-created on first `/api/user/profile` call (JIT provisioning)
- Gemini roles: DB stores `"assistant"`, Gemini API needs `"model"` — role mapping happens in the route handler
- `sessionStorage` key `"lina_pending_tool_events"` bridges tool events across new-chat navigation

## Gotchas

- `@google/genai` is in build.mjs's external list (`@google/*`), so it must be installed as a direct dep in `api-server`
- After each OpenAPI spec change, re-run codegen before using the updated types
- Clerk proxy middleware must be mounted BEFORE body parsers in app.ts
- `SESSION_SECRET` is required at runtime — missing it throws on first encrypt/decrypt and on OAuth state signing

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
