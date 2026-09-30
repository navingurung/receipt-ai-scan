/** 送信前の長辺の上限（アップロード時間と画像トークンを抑える） */
export const MAX_EDGE = 1536;
const JPEG_QUALITY = 0.85;

const PASSTHROUGH_TYPES = new Set(["image/heic", "image/heif"]);

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image"))),
      "image/jpeg",
      quality,
    );
  });
}

export function scaleToFit(width: number, height: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function decode(source: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    // createImageBitmap 非対応の形式は <img> でデコードを試す
    const url = URL.createObjectURL(source);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      return Object.assign(image, { width: image.naturalWidth, height: image.naturalHeight });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function guessType(file: Blob): string {
  if (file.type) return file.type;
  const name = file instanceof File ? file.name.toLowerCase() : "";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return "";
}

/**
 * どの形式の画像でも JPEG（長辺 1536px 以下）に変換する。
 * ブラウザでデコードできない HEIC/HEIF はそのまま送る（Gemini 側で対応）。
 */
export async function prepareImage(source: Blob): Promise<Blob> {
  const type = guessType(source);

  let image: Awaited<ReturnType<typeof decode>>;
  try {
    image = await decode(source);
  } catch {
    if (PASSTHROUGH_TYPES.has(type)) return new Blob([source], { type });
    throw new Error("This image format can't be opened. Use JPEG, PNG, WebP, or HEIC.");
  }

  const { width, height } = scaleToFit(image.width, image.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available");
  context.drawImage(image, 0, 0, width, height);
  if ("close" in image && typeof image.close === "function") image.close();
  return canvasToJpeg(canvas);
}
