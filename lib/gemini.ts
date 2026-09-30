import { RECEIPT_JSON_SCHEMA, RECEIPT_PROMPT, normalizeReceipt, type Receipt } from "@/lib/receipt-schema";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const TIMEOUT_MS = 20_000;

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GeminiError";
  }
}

export type ExtractResult = {
  receipt: Receipt;
  model: string;
  aiMs: number;
};

function getConfig() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY is not set in .env.local", 500);
  return { apiKey, model: process.env.GEMINI_MODEL || DEFAULT_MODEL };
}

// REST レスポンスから最終テキストを取り出す（思考ステップは除外）
function findOutputText(data: unknown): string | null {
  if (data && typeof data === "object" && "output_text" in data && typeof data.output_text === "string") {
    return data.output_text;
  }

  let last: string | null = null;
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.type === "thought") return;
    if (record.type === "text" && typeof record.text === "string") last = record.text;
    Object.entries(record).forEach(([key, value]) => {
      if (key !== "input" && key !== "user_input") visit(value);
    });
  };
  visit(data);
  return last;
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object" || !("error" in data)) return undefined;
  const error = data.error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return undefined;
}

export async function extractReceipt(image: { base64: string; mimeType: string }): Promise<ExtractResult> {
  const { apiKey, model } = getConfig();
  const startedAt = performance.now();

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      input: [
        { type: "text", text: RECEIPT_PROMPT },
        { type: "image", data: image.base64, mime_type: image.mimeType },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: RECEIPT_JSON_SCHEMA,
      },
      generation_config: { thinking_level: "minimal" },
      // レシート画像を Google 側に保存しない
      store: false,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const data: unknown = await response.json().catch(() => null);
  const aiMs = Math.round(performance.now() - startedAt);

  if (!response.ok) {
    if (response.status === 429) {
      throw new GeminiError("Free tier limit reached. Wait a minute, or check the limits in AI Studio.", 429);
    }
    throw new GeminiError(extractErrorMessage(data) ?? `Gemini request failed (${response.status})`, response.status);
  }

  const text = findOutputText(data);
  if (!text) throw new GeminiError("Gemini returned no text", 502);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError("Gemini returned invalid JSON", 502);
  }

  return { receipt: normalizeReceipt(parsed), model, aiMs };
}
