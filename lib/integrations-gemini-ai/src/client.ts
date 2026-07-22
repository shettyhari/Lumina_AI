import { GoogleGenAI } from "@google/genai";

function createClient(): GoogleGenAI {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || "dummy-key-for-dev";

  const options: Record<string, any> = { apiKey };

  if (baseUrl) {
    options.httpOptions = {
      apiVersion: "",
      baseUrl,
    };
  }

  return new GoogleGenAI(options);
}

// Lazy singleton — client is created on first use so the server can start
// even when env vars are not yet set at module load time.
let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!_client) {
    _client = createClient();
  }
  return _client;
}

export const ai = new Proxy({} as GoogleGenAI, {
  get(_target, prop: string | symbol) {
    return (getClient() as any)[prop];
  },
});
