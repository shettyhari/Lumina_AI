import { ai } from "../client";

export interface ReceiptExtraction {
  amount: number;
  merchant: string | null;
  category: string;
  date: string | null; // YYYY-MM-DD
  lineItems: string[];
}

const RECEIPT_PROMPT = `You are reading a photo of a receipt. Extract the following as strict JSON
with exactly these keys, no markdown fences, no commentary:
{
  "amount": <total amount paid, as a number, no currency symbol>,
  "merchant": <store/vendor name, or null if unreadable>,
  "category": <one of: Groceries, Dining, Transportation, Utilities, Housing, Healthcare, Entertainment, Clothing, Other>,
  "date": <purchase date as YYYY-MM-DD, or null if unreadable>,
  "lineItems": [<short strings for each line item, empty array if unreadable>]
}
If the image is not a receipt or the total is unreadable, set "amount" to 0.`;

function isValidExtraction(value: unknown): value is ReceiptExtraction {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.amount === "number" &&
    (v.merchant === null || typeof v.merchant === "string") &&
    typeof v.category === "string" &&
    (v.date === null || typeof v.date === "string") &&
    Array.isArray(v.lineItems)
  );
}

export async function extractReceiptData(
  base64Image: string,
  mimeType: string
): Promise<ReceiptExtraction> {
  const response = await ai.models.generateContent({
    model: "gemini-flash-latest",
    contents: [
      {
        role: "user",
        parts: [
          { text: RECEIPT_PROMPT },
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
    throw new Error("Receipt extraction returned invalid JSON");
  }

  if (!isValidExtraction(parsed)) {
    throw new Error("Receipt extraction returned an unexpected shape");
  }

  return {
    amount: parsed.amount,
    merchant: parsed.merchant,
    category: parsed.category,
    date: parsed.date,
    lineItems: parsed.lineItems.filter((i): i is string => typeof i === "string"),
  };
}
