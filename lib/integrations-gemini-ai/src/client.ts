import { GoogleGenAI } from "@google/genai";

function createClient(): GoogleGenAI {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;

  if (!baseUrl) {
    throw new Error(
      "AI_INTEGRATIONS_GEMINI_BASE_URL must be set. Did you forget to provision the Gemini AI integration?",
    );
  }

  if (!apiKey) {
    throw new Error(
      "AI_INTEGRATIONS_GEMINI_API_KEY must be set. Please add your Gemini API key to the environment secrets.",
    );
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      apiVersion: "",
      baseUrl,
    },
  });
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
