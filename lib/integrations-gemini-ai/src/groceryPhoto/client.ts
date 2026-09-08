import { ai } from "../client";

export interface GroceryPhotoItem {
  name: string;
  quantity: string | null;
  category: string;
}

export interface GroceryPhotoExtraction {
  items: GroceryPhotoItem[];
}

const GROCERY_PROMPT = `You are looking at a photo of groceries — items on a counter, in bags, or on a table after a shopping trip. Identify each distinct food/household item visible. Extract as strict JSON with exactly this key, no markdown fences, no commentary:
{
  "items": [
    { "name": <short item name, e.g. "Bananas">, "quantity": <estimated quantity/unit if visible, e.g. "1 bunch", "2 cans", or null if unclear>, "category": <one of: produce, dairy, meat, grains, canned, frozen, snacks, beverages, other> }
  ]
}
Only include items you can actually identify. If no identifiable grocery items are visible, return {"items": []}.`;

function isValidExtraction(value: unknown): value is { items: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.items) && v.items.every((i) => i && typeof i === "object" && typeof (i as Record<string, unknown>).name === "string");
}

export async function extractGroceryPhotoItems(
  base64Image: string,
  mimeType: string,
): Promise<GroceryPhotoExtraction> {
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [
      {
        role: "user",
        parts: [
          { text: GROCERY_PROMPT },
          { inlineData: { mimeType, data: base64Image } },
        ],
      },
    ],
    config: { responseMimeType: "application/json" },
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text ?? "{}");
  } catch {
    throw new Error("Grocery photo extraction returned invalid JSON");
  }

  if (!isValidExtraction(parsed)) {
    throw new Error("Grocery photo extraction returned an unexpected shape");
  }

  return {
    items: parsed.items.map((i) => {
      const item = i as Record<string, unknown>;
      return {
        name: String(item.name),
        quantity: item.quantity != null ? String(item.quantity) : null,
        category: typeof item.category === "string" ? item.category : "other",
      };
    }),
  };
}
