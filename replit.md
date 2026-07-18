# Lumina AI — Personal AI Assistant

A fully-featured personal AI assistant with a Gemini-style dark UI, real-time LLM streaming, Google login, conversation history, image generation, and a rich dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/ai-assistant run dev` — run the frontend (port 19570)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind v4, shadcn/ui, Wouter routing, Framer Motion
- Auth: Clerk (Google OAuth + email/password), via `@clerk/react` + `@clerk/express`
- AI: Gemini via Replit AI Integrations (`@workspace/integrations-gemini-ai`)
- DB: PostgreSQL + Drizzle ORM
- API: Express 5 with SSE streaming for chat

## Where things live

- `artifacts/ai-assistant/` — React + Vite frontend
- `artifacts/api-server/` — Express 5 API server
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth)
- `lib/api-client-react/` — generated React Query hooks
- `lib/api-zod/` — generated Zod validation schemas
- `lib/db/src/schema/` — Drizzle table definitions (users, conversations, messages)
- `lib/integrations-gemini-ai/` — Gemini AI SDK client + image/batch helpers

## Features

- **Chat**: Real-time streaming AI responses via SSE, conversation history, model selector
- **Image Generation**: Text-to-image with Gemini Flash Image model
- **Dashboard**: Stats (conversations, messages, images), pinned threads, recent activity
- **Settings**: Display name, preferred model, system prompt, theme
- **Auth**: Clerk with Google OAuth + email/password, branded sign-in/sign-up pages

## Architecture decisions

- SSE streaming for chat: uses `fetch + ReadableStream` on the client since `EventSource` only supports GET
- Conversations are scoped by `clerkUserId` — users only see their own data
- User profiles are auto-created on first `/api/user/profile` call (JIT provisioning)
- Gemini roles: DB stores `"assistant"`, Gemini API needs `"model"` — role mapping happens in the route handler

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- `@google/genai` is in build.mjs's external list (`@google/*`), so it must be installed as a direct dep in `api-server`
- After each OpenAPI spec change, re-run codegen before using the updated types
- Clerk proxy middleware must be mounted BEFORE body parsers in app.ts

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
