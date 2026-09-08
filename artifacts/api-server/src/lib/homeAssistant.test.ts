/**
 * Unit tests for controlEntity's action -> Home Assistant service-call
 * mapping — the actual logic deciding what happens when Lina is asked to
 * lock a door, dim a light, or open a cover. No real Home Assistant
 * instance: fetch is stubbed and each test asserts the exact URL/body that
 * would have been sent, since a wrong mapping here means the wrong
 * physical device gets controlled.
 *
 * Run with: pnpm --filter @workspace/api-server test
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { controlEntity, HomeAssistantError, type HomeAssistantConfig } from "./homeAssistant.js";

const config: HomeAssistantConfig = { baseUrl: "http://homeassistant.local:8123", token: "test-token" };

interface CapturedCall {
  url: string;
  method: string | undefined;
  body: unknown;
  authHeader: string | undefined;
}

let calls: CapturedCall[] = [];
let originalFetch: typeof fetch;

function stubFetch(status = 200) {
  originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      authHeader: headers.get("Authorization") ?? undefined,
    });
    return new Response(status === 204 ? null : "{}", { status });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  stubFetch();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("controlEntity", () => {
  it("turn_on calls the entity's own domain service, not a hardcoded one", async () => {
    await controlEntity(config, "switch.coffee_maker", "turn_on");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/switch/turn_on");
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(calls[0].body, { entity_id: "switch.coffee_maker" });
    assert.equal(calls[0].authHeader, "Bearer test-token");
  });

  it("turn_off uses the light domain for a light entity", async () => {
    await controlEntity(config, "light.living_room", "turn_off");
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/light/turn_off");
  });

  it("toggle uses the entity's domain", async () => {
    await controlEntity(config, "fan.bedroom", "toggle");
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/fan/toggle");
  });

  it("lock ALWAYS calls the lock domain, even if the entity_id doesn't start with lock. (defensive — a wrong domain here unlocks nothing, or the wrong thing)", async () => {
    await controlEntity(config, "lock.front_door", "lock");
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/lock/lock");
    assert.deepEqual(calls[0].body, { entity_id: "lock.front_door" });
  });

  it("unlock calls the lock domain's unlock service", async () => {
    await controlEntity(config, "lock.front_door", "unlock");
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/lock/unlock");
  });

  it("open calls cover/open_cover", async () => {
    await controlEntity(config, "cover.garage", "open");
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/cover/open_cover");
  });

  it("close calls cover/close_cover", async () => {
    await controlEntity(config, "cover.garage", "close");
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/cover/close_cover");
  });

  it("set_temperature always targets climate/set_temperature regardless of entity_id prefix", async () => {
    await controlEntity(config, "climate.thermostat", "set_temperature", 21);
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/climate/set_temperature");
    assert.deepEqual(calls[0].body, { entity_id: "climate.thermostat", temperature: 21 });
  });

  it("set_temperature without a value throws before making any request", async () => {
    await assert.rejects(() => controlEntity(config, "climate.thermostat", "set_temperature"), HomeAssistantError);
    assert.equal(calls.length, 0);
  });

  it("set_brightness always targets light/turn_on with brightness_pct", async () => {
    await controlEntity(config, "light.desk_lamp", "set_brightness", 60);
    assert.equal(calls[0].url, "http://homeassistant.local:8123/api/services/light/turn_on");
    assert.deepEqual(calls[0].body, { entity_id: "light.desk_lamp", brightness_pct: 60 });
  });

  it("set_brightness clamps out-of-range values into 0-100", async () => {
    await controlEntity(config, "light.desk_lamp", "set_brightness", 150);
    assert.deepEqual(calls[0].body, { entity_id: "light.desk_lamp", brightness_pct: 100 });

    await controlEntity(config, "light.desk_lamp", "set_brightness", -10);
    assert.deepEqual(calls[1].body, { entity_id: "light.desk_lamp", brightness_pct: 0 });
  });

  it("rejects an unsupported action without making any request", async () => {
    await assert.rejects(() => controlEntity(config, "light.desk_lamp", "explode"), HomeAssistantError);
    assert.equal(calls.length, 0);
  });

  it("surfaces a clear error when Home Assistant rejects the token (401)", async () => {
    stubFetch(401);
    await assert.rejects(
      () => controlEntity(config, "light.desk_lamp", "turn_on"),
      (err: unknown) => err instanceof HomeAssistantError && /token/i.test(err.message),
    );
  });
});
