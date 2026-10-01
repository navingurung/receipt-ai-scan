export type FrameStats = {
  /** 平均輝度 0–255 */
  brightness: number;
  /** ラプラシアンの平均絶対値（大きいほどシャープ） */
  sharpness: number;
  /** 前フレームとの平均差分（大きいほど動いている） */
  motion: number;
  /** 明るい画素（紙）の割合 0–1 */
  paperRatio: number;
  /** 紙の範囲（枠に対する比率 0–1） */
  paperBox: { top: number; bottom: number; left: number; right: number } | null;
};

export const DETECTION = {
  minBrightness: 60,
  maxBrightness: 245,
  /** 手ブレを考慮して緩めに設定 */
  minSharpness: 14,
  maxMotion: 25,
  /** 紙とみなす輝度 */
  paperLevel: 160,
  /** 行・列の何割が紙なら「紙の行・列」とみなすか */
  paperLineRatio: 0.15,
  /** 枠に対して紙が占めるべき最小の高さ・幅 */
  minFillHeight: 0.6,
  minFillWidth: 0.35,
  /** 中心からのずれの許容値（枠に対する比率） */
  maxCenterOffset: 0.18,
  /** 枠の端から何割以内を「端に接している」とみなすか */
  edgeMargin: 0.02,
  /** 枠に合った状態が続いたら撮影するフレーム数（100ms 間隔で約 0.7 秒） */
  stableFrames: 7,
  /** カメラ起動直後は判定しない時間 */
  warmupMs: 800,
} as const;

function findPaperBox(gray: Uint8ClampedArray, width: number, height: number): FrameStats["paperBox"] {
  const rowHits = new Uint32Array(height);
  const colHits = new Uint32Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x] >= DETECTION.paperLevel) {
        rowHits[y]++;
        colHits[x]++;
      }
    }
  }

  const rows = [...rowHits.keys()].filter((y) => rowHits[y] >= width * DETECTION.paperLineRatio);
  const cols = [...colHits.keys()].filter((x) => colHits[x] >= height * DETECTION.paperLineRatio);
  if (rows.length === 0 || cols.length === 0) return null;

  return {
    top: rows[0] / height,
    bottom: (rows[rows.length - 1] + 1) / height,
    left: cols[0] / width,
    right: (cols[cols.length - 1] + 1) / width,
  };
}

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
      paperBox: findPaperBox(gray, width, height),
    },
    gray,
  };
}

export type FrameVerdict =
  | "ok"
  | "noReceipt"
  | "tooFar"
  | "tooClose"
  | "offCenter"
  | "dark"
  | "bright"
  | "blurry"
  | "moving";

/** 枠合わせの状態（ガイド枠の色に使用） */
export type FitLevel = "none" | "near" | "fit";

export function judgeFrame(stats: FrameStats): { verdict: FrameVerdict; fit: FitLevel } {
  if (stats.brightness < DETECTION.minBrightness) return { verdict: "dark", fit: "none" };

  const box = stats.paperBox;
  if (!box) return { verdict: "noReceipt", fit: "none" };

  const fillHeight = box.bottom - box.top;
  const fillWidth = box.right - box.left;
  const m = DETECTION.edgeMargin;
  const touches = [box.top <= m, box.bottom >= 1 - m, box.left <= m, box.right >= 1 - m].filter(Boolean).length;
  const offsetX = Math.abs((box.left + box.right) / 2 - 0.5);
  const offsetY = Math.abs((box.top + box.bottom) / 2 - 0.5);

  // 3 辺以上が枠に接している＝はみ出している可能性が高い
  if (touches >= 3 && stats.paperRatio > 0.85) return { verdict: "tooClose", fit: "near" };
  if (fillHeight < DETECTION.minFillHeight && fillWidth < DETECTION.minFillWidth * 1.6) {
    return { verdict: "tooFar", fit: "near" };
  }
  if (offsetX > DETECTION.maxCenterOffset || offsetY > DETECTION.maxCenterOffset) {
    return { verdict: "offCenter", fit: "near" };
  }

  // 枠には合っている。あとは撮影できる状態か
  if (stats.brightness > DETECTION.maxBrightness) return { verdict: "bright", fit: "fit" };
  if (stats.motion > DETECTION.maxMotion) return { verdict: "moving", fit: "fit" };
  if (stats.sharpness < DETECTION.minSharpness) return { verdict: "blurry", fit: "fit" };
  return { verdict: "ok", fit: "fit" };
}

/** 撮影候補のシャープさを比較するための簡易計測 */
export function measureSharpness(image: ImageData): number {
  return analyzeFrame(image, null).stats.sharpness;
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