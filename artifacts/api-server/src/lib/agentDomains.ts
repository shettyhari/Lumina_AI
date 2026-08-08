import { TOOL_DECLARATIONS } from "./agentTools.js";

/** Groups Lina's flat tool list into domains for the router/orchestrator.
 *  executeTool() itself stays a single flat dispatcher — this only controls
 *  which tool declarations a given sub-agent turn is allowed to see/call. */
export const DOMAIN_TOOLS: Record<string, string[]> = {
  shopping: ["add_shopping_items", "get_shopping_list", "check_off_shopping_item"],
  reminders_calendar: ["add_reminder", "get_reminders", "add_calendar_event", "get_calendar_events"],
  chores: ["add_chore", "get_chores", "complete_chore"],
  budget: ["add_budget_entry", "parse_receipt_image", "get_budget_summary"],
  notes: ["create_note", "get_notes"],
  pantry: ["add_pantry_item", "get_pantry"],
  family: ["get_family_members", "send_family_message"],
  automation: ["create_automation", "generate_weekly_insight"],
};

export const DOMAIN_KEYS = Object.keys(DOMAIN_TOOLS);

const DECL_BY_NAME = new Map(TOOL_DECLARATIONS.map((d) => [d.name, d]));

export function getToolDeclarationsForDomains(domains: string[]): typeof TOOL_DECLARATIONS {
  const names = new Set(domains.flatMap((d) => DOMAIN_TOOLS[d] ?? []));
  return TOOL_DECLARATIONS.filter((d) => names.has(d.name));
}

const ROUTE_TOOL_DECLARATION = {
  name: "route_to_domains",
  description: "Classify which household domains the user's latest message needs.",
  parameters: {
    type: "object",
    properties: {
      domains: {
        type: "array",
        items: { type: "string", enum: [...DOMAIN_KEYS, "general"] },
        description:
          "Relevant domain keys. Use 'general' ALONE when the message is small talk, a question needing no household data, or otherwise doesn't need any tool. Include multiple domains when the request spans more than one (e.g. 'log this $40 grocery receipt and add milk to the list' -> ['budget','shopping']).",
      },
    },
    required: ["domains"],
  },
};

/** One lightweight Gemini call that decides which domain(s) of tools the
 *  current turn needs, so the orchestrator only loads relevant tools into
 *  each sub-agent instead of exposing the full ~20-tool surface every turn.
 *  Returns null on any classification failure (e.g. rate limit) — the
 *  caller falls back to a single cheap flat call with every tool exposed,
 *  NOT "all domains" (that would multiply API calls into N sub-agent loops
 *  right when the quota is already exhausted, guaranteeing every following
 *  message fails too). */
export async function classifyDomains(
  geminiClient: { models: { generateContent: (args: any) => Promise<any> } },
  model: string,
  latestMessage: string,
  recentContext: string,
): Promise<string[] | null> {
  try {
    const response = await geminiClient.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [{
            text: `Recent conversation context:\n${recentContext}\n\nLatest user message: "${latestMessage}"\n\nClassify which domains this needs.`,
          }],
        },
      ],
      config: {
        tools: [{ functionDeclarations: [ROUTE_TOOL_DECLARATION] }],
        toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["route_to_domains"] } },
      },
    });
    const call = response.candidates?.[0]?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;
    const domains: string[] = call?.args?.domains ?? [];
    const valid = domains.filter((d) => DOMAIN_KEYS.includes(d));
    if (valid.length === 0) return domains.includes("general") ? [] : DOMAIN_KEYS;
    return valid;
  } catch {
    return null; // routing unavailable — caller uses the flat fallback path
  }
}
