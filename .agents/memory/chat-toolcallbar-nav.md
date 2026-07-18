---
name: Chat ToolCallBar Navigation Bug
description: Why tool-event state is lost when a new chat navigates from /chat → /chat/:id, and the correct fix.
---

## The rule
Use `sessionStorage` (not a module-level JS variable) to carry tool events across the /chat → /chat/:id navigation.

**Why:**
Wouter patches `window.history.pushState`, so any call to `pushState` or `setLocation` immediately triggers a Wouter route change that unmounts the current component. React state updates queued *after* unmount are silently discarded. Module-level variables seemed safe, but they aren't if the component is mounted a second time (e.g., Strict Mode double-invocation, or any render cycle that re-initialises the variable before the finally block writes to it).

**How to apply:**
- In the SSE parsing loop, maintain both a `toolEventsRef` (updated synchronously on every chunk) and call `setToolEvents` (for immediate UI updates).
- In the `finally` block, **before** calling `setLocation`, write `toolEventsRef.current` to `sessionStorage` via a helper (`savePendingToolEvents`).
- On `useState` initialisation in the chat component, call `loadAndClearPendingToolEvents()` to read and atomically clear the sessionStorage entry.
- Do NOT call `window.history.pushState` during conversation creation — this immediately unmounts the streaming component. Only navigate via `setLocation` in `finally`, after streaming is fully complete.
