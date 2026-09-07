/**
 * Home Assistant REST API client. Each family member connects their own
 * Home Assistant instance (base URL + long-lived access token) in Settings;
 * credentials are stored per-user via the same encrypted userApiKeys store
 * used for AI provider keys, under provider "home_assistant".
 */

import { getUserApiKeyRecord } from "./userApiKeysStore.js";

export interface HomeAssistantConfig {
  baseUrl: string;
  token: string;
}

export interface HomeAssistantEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export class HomeAssistantError extends Error {}

export async function getHomeAssistantConfig(clerkUserId: string): Promise<HomeAssistantConfig | null> {
  const raw = await getUserApiKeyRecord(clerkUserId, "home_assistant");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HomeAssistantConfig>;
    if (!parsed.baseUrl || !parsed.token) return null;
    return { baseUrl: parsed.baseUrl.replace(/\/+$/, ""), token: parsed.token };
  } catch {
    return null;
  }
}

async function haFetch(config: HomeAssistantConfig, path: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err: any) {
    throw new HomeAssistantError(`Could not reach Home Assistant at ${config.baseUrl}: ${err?.message ?? "network error"}`);
  }
  if (!res.ok) {
    if (res.status === 401) throw new HomeAssistantError("Home Assistant rejected the access token — it may have been revoked. Add a new long-lived access token in Settings.");
    throw new HomeAssistantError(`Home Assistant returned ${res.status} for ${path}.`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function listEntities(config: HomeAssistantConfig, domainFilter?: string): Promise<HomeAssistantEntity[]> {
  const states = (await haFetch(config, "/api/states")) as HomeAssistantEntity[];
  if (!domainFilter) return states;
  return states.filter((e) => e.entity_id.startsWith(`${domainFilter}.`));
}

const SIMPLE_ACTIONS = new Set(["turn_on", "turn_off", "toggle"]);

/** Turns a friendly action + optional value into the right Home Assistant
 *  domain/service/data call. Kept deliberately narrow to the handful of
 *  actions the agent tool exposes — not a general service-call passthrough. */
export async function controlEntity(
  config: HomeAssistantConfig,
  entityId: string,
  action: string,
  value?: number,
): Promise<void> {
  const entityDomain = entityId.split(".")[0];

  if (action === "set_temperature") {
    if (value == null) throw new HomeAssistantError("set_temperature requires a value (target temperature).");
    await haFetch(config, `/api/services/climate/set_temperature`, {
      method: "POST",
      body: JSON.stringify({ entity_id: entityId, temperature: value }),
    });
    return;
  }

  if (action === "set_brightness") {
    if (value == null) throw new HomeAssistantError("set_brightness requires a value (0-100).");
    await haFetch(config, `/api/services/light/turn_on`, {
      method: "POST",
      body: JSON.stringify({ entity_id: entityId, brightness_pct: Math.max(0, Math.min(100, value)) }),
    });
    return;
  }

  if (action === "lock" || action === "unlock") {
    await haFetch(config, `/api/services/lock/${action}`, {
      method: "POST",
      body: JSON.stringify({ entity_id: entityId }),
    });
    return;
  }

  if (action === "open" || action === "close") {
    await haFetch(config, `/api/services/cover/${action}_cover`, {
      method: "POST",
      body: JSON.stringify({ entity_id: entityId }),
    });
    return;
  }

  if (!SIMPLE_ACTIONS.has(action)) {
    throw new HomeAssistantError(`Unsupported action "${action}".`);
  }

  // turn_on / turn_off / toggle — standard across light, switch, fan,
  // climate, media_player, humidifier, etc.
  await haFetch(config, `/api/services/${entityDomain}/${action}`, {
    method: "POST",
    body: JSON.stringify({ entity_id: entityId }),
  });
}
