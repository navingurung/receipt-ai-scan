import { GeminiError, extractReceipt } from "@/lib/gemini";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
// Gemini が受け付ける画像形式
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse("Send the image as multipart/form-data", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("No image received", 400);
  if (!SUPPORTED_TYPES.has(file.type)) {
    return errorResponse(`Unsupported image type: ${file.type || "unknown"}`, 415);
  }
  if (file.size > MAX_FILE_SIZE) return errorResponse("Image must be 15 MB or smaller", 413);

  try {
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const result = await extractReceipt({ base64, mimeType: file.type });
    return Response.json(result);
  } catch (error) {
    if (error instanceof GeminiError) return errorResponse(error.message, error.status);
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return errorResponse("Gemini did not respond in time", 504);
    }
    console.error("receipt-scan failed", error);
    return errorResponse("Unexpected server error", 500);
  }
}
