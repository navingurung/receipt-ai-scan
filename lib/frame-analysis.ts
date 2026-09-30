export type FrameStats = {
  /** 平均輝度 0–255 */
  brightness: number;
  /** ラプラシアンの平均絶対値（大きいほどシャープ） */
  sharpness: number;
  /** 前フレームとの平均差分（大きいほど動いている） */
  motion: number;
  /** 明るい画素（紙）の割合 0–1 */
  paperRatio: number;
};

export const DETECTION = {
  minBrightness: 60,
  maxBrightness: 245,
  minSharpness: 20,
  maxMotion: 12,
  /** 枠内に占める紙（明るい画素）の最低割合 */
  minPaperRatio: 0.3,
  /** 紙とみなす輝度 */
  paperLevel: 160,
  /** 連続で条件を満たしたフレーム数（100ms 間隔で約 1.5 秒） */
  stableFrames: 15,
  /** カメラ起動直後は判定しない時間 */
  warmupMs: 1000,
} as const;

export function analyzeFrame(
  image: ImageData,
  previous: Uint8ClampedArray | null,
): { stats: FrameStats; gray: Uint8ClampedArray } {
  const { width, height, data } = image;
  const gray = new Uint8ClampedArray(width * height);

  let brightnessSum = 0;
  let paperCount = 0;
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    const value = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000;
    gray[i] = value;
    brightnessSum += value;
    if (value >= DETECTION.paperLevel) paperCount++;
  }

  let laplacianSum = 0;
  let laplacianCount = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const laplacian = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      laplacianSum += Math.abs(laplacian);
      laplacianCount++;
    }
  }

  let motion = 255;
  if (previous && previous.length === gray.length) {
    let diffSum = 0;
    for (let i = 0; i < gray.length; i++) diffSum += Math.abs(gray[i] - previous[i]);
    motion = diffSum / gray.length;
  }

  return {
    stats: {
      brightness: brightnessSum / gray.length,
      sharpness: laplacianCount ? laplacianSum / laplacianCount : 0,
      motion,
      paperRatio: paperCount / gray.length,
    },
    gray,
  };
}

export type FrameVerdict = "ok" | "dark" | "bright" | "blurry" | "moving" | "noReceipt";

export function judgeFrame(stats: FrameStats): FrameVerdict {
  if (stats.brightness < DETECTION.minBrightness) return "dark";
  if (stats.paperRatio < DETECTION.minPaperRatio) return "noReceipt";
  if (stats.brightness > DETECTION.maxBrightness) return "bright";
  if (stats.motion > DETECTION.maxMotion) return "moving";
  if (stats.sharpness < DETECTION.minSharpness) return "blurry";
  return "ok";
}

/**
 * 画面上の要素の矩形を、object-cover で表示された video の画素座標に変換する。
 */
export function mapElementRectToVideo(video: HTMLVideoElement, element: HTMLElement) {
  const videoRect = video.getBoundingClientRect();
  const targetRect = element.getBoundingClientRect();
  const scale = Math.max(videoRect.width / video.videoWidth, videoRect.height / video.videoHeight);
  const offsetX = (videoRect.width - video.videoWidth * scale) / 2;
  const offsetY = (videoRect.height - video.videoHeight * scale) / 2;

  const x = (targetRect.left - videoRect.left - offsetX) / scale;
  const y = (targetRect.top - videoRect.top - offsetY) / scale;
  const width = targetRect.width / scale;
  const height = targetRect.height / scale;

  const clampedX = Math.max(0, Math.min(video.videoWidth, x));
  const clampedY = Math.max(0, Math.min(video.videoHeight, y));
  return {
    x: clampedX,
    y: clampedY,
    width: Math.max(1, Math.min(video.videoWidth - clampedX, width)),
    height: Math.max(1, Math.min(video.videoHeight - clampedY, height)),
  };
}