"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DETECTION,
  analyzeFrame,
  judgeFrame,
  mapElementRectToVideo,
  measureSharpness,
  type FitLevel,
  type FrameVerdict,
} from "@/lib/frame-analysis";
import { canvasToJpeg, scaleToFit } from "@/lib/image";

type ReceiptScannerProps = {
  onCapture: (image: Blob) => void;
  onClose: () => void;
};

const ANALYSIS_WIDTH = 160;
const ANALYSIS_INTERVAL_MS = 100;
const LOW_RESOLUTION = 1080;
/** 撮影時に連続で取得するフレーム数と間隔（最もシャープなものを採用） */
const BURST_FRAMES = 3;
const BURST_INTERVAL_MS = 120;

const HINTS: Record<FrameVerdict | "waiting", string> = {
  waiting: "レシート全体を枠に合わせてください",
  noReceipt: "レシート全体を枠に合わせてください",
  tooFar: "もう少し近づけてください",
  tooClose: "少し離してください",
  offCenter: "枠の中央に合わせてください",
  dark: "暗すぎます。明るい場所で撮影してください",
  bright: "反射しています。角度を少し変えてください",
  moving: "そのまま",
  blurry: "ピントを合わせています…",
  ok: "撮影します",
};

const CORNER_COLORS: Record<FitLevel, string> = {
  none: "border-white",
  near: "border-amber-400",
  fit: "border-scan",
};

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function ReceiptScanner({ onCapture, onClose }: ReceiptScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const capturedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<FrameVerdict | "waiting">("waiting");
  const [fit, setFit] = useState<FitLevel>("none");
  const [progress, setProgress] = useState(0);
  const [lowResolution, setLowResolution] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // カメラ起動（Strict Mode の二重マウント対策に世代番号で管理）
  useEffect(() => {
    const requestId = ++requestIdRef.current;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // 縦長のレシートを切り出しても文字が潰れないよう高解像度を要求
            width: { ideal: 3840 },
            height: { ideal: 2160 },
          },
          audio: false,
        });
        if (requestId !== requestIdRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setLowResolution(Math.min(video.videoWidth, video.videoHeight) < LOW_RESOLUTION);
        setReady(true);
      } catch (cause) {
        if (requestId !== requestIdRef.current) return;
        const denied = cause instanceof DOMException && cause.name === "NotAllowedError";
        setError(
          denied
            ? "カメラへのアクセスが許可されていません。ブラウザの設定で許可してください。"
            : "カメラを起動できませんでした。",
        );
      }
    }

    void start();
    return () => {
      requestIdRef.current++;
      stopStream();
    };
  }, [stopStream]);

  // 手ブレ対策：数フレーム連続で切り出し、最もシャープなものを採用
  const capture = useCallback(async () => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || capturedRef.current || !video.videoWidth) return;
    capturedRef.current = true;
    setCapturing(true);

    const probe = document.createElement("canvas");
    const probeContext = probe.getContext("2d", { willReadFrequently: true });
    let best: { canvas: HTMLCanvasElement; sharpness: number } | null = null;

    for (let shot = 0; shot < BURST_FRAMES; shot++) {
      if (shot > 0) await wait(BURST_INTERVAL_MS);
      const crop = mapElementRectToVideo(video, frame);
      const size = scaleToFit(crop.width, crop.height);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      canvas.getContext("2d")?.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);

      let sharpness = 0;
      if (probeContext) {
        probe.width = 320;
        probe.height = Math.max(1, Math.round((size.height / size.width) * 320));
        probeContext.drawImage(canvas, 0, 0, probe.width, probe.height);
        sharpness = measureSharpness(probeContext.getImageData(0, 0, probe.width, probe.height));
      }
      if (!best || sharpness > best.sharpness) best = { canvas, sharpness };
    }

    try {
      if (!best) throw new Error("no frame");
      const blob = await canvasToJpeg(best.canvas);
      stopStream();
      onCapture(blob);
    } catch {
      capturedRef.current = false;
      setCapturing(false);
      setError("撮影に失敗しました。もう一度お試しください。");
    }
  }, [onCapture, stopStream]);

  // フレーム解析：枠に合っていて大きく動いていなければ自動撮影
  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame) return;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const startedAt = performance.now();
    let previous: Uint8ClampedArray | null = null;
    let stable = 0;

    const timer = window.setInterval(() => {
      if (capturedRef.current || !video.videoWidth) return;
      const crop = mapElementRectToVideo(video, frame);
      canvas.width = ANALYSIS_WIDTH;
      canvas.height = Math.max(1, Math.round((crop.height / crop.width) * ANALYSIS_WIDTH));
      context.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);

      const { stats, gray } = analyzeFrame(context.getImageData(0, 0, canvas.width, canvas.height), previous);
      previous = gray;
      if (performance.now() - startedAt < DETECTION.warmupMs) return;

      const result = judgeFrame(stats);
      stable = result.verdict === "ok" ? stable + 1 : 0;
      setFit(result.fit);
      setVerdict(result.verdict === "ok" && stable < DETECTION.stableFrames ? "moving" : result.verdict);
      setProgress(Math.min(1, stable / DETECTION.stableFrames));
      if (stable >= DETECTION.stableFrames) void capture();
    }, ANALYSIS_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [ready, capture]);

  const handleClose = () => {
    stopStream();
    onClose();
  };

  const hint = error ?? (capturing ? "撮影しています…" : ready ? HINTS[verdict] : "カメラを起動しています…");

  return (
    // カメラ映像を画面全体に表示し、操作ボタンは映像の上に重ねる
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      <div className="absolute inset-0 flex items-center justify-center px-[6vw] pt-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] pb-[max(9.5rem,calc(env(safe-area-inset-bottom)+8.5rem))]">
        <div
          ref={frameRef}
          className="relative aspect-[5/8] h-full max-h-full max-w-full rounded-lg"
          style={{ boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.35)" }}
        >
          {/* 3×3 グリッド */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <span className="absolute inset-y-0 left-1/3 w-px bg-white/35" />
            <span className="absolute inset-y-0 left-2/3 w-px bg-white/35" />
            <span className="absolute inset-x-0 top-1/3 h-px bg-white/35" />
            <span className="absolute inset-x-0 top-2/3 h-px bg-white/35" />
          </div>
          {(
            [
              "left-0 top-0 border-l-[5px] border-t-[5px] rounded-tl-lg",
              "right-0 top-0 border-r-[5px] border-t-[5px] rounded-tr-lg",
              "left-0 bottom-0 border-l-[5px] border-b-[5px] rounded-bl-lg",
              "right-0 bottom-0 border-r-[5px] border-b-[5px] rounded-br-lg",
            ] as const
          ).map((corner) => (
            <span
              key={corner}
              className={`absolute h-12 w-12 transition-colors duration-200 ${corner} ${CORNER_COLORS[fit]}`}
            />
          ))}
          <div className="absolute inset-x-8 bottom-5 h-1.5 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
            <div className="h-full bg-scan transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        {lowResolution ? (
          <p className="rounded-full bg-black/55 px-3 py-1.5 text-xs backdrop-blur">
            カメラの解像度が低いため、精度が下がる場合があります
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleClose}
          aria-label="閉じる"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black/45 text-2xl backdrop-blur focus-visible:outline-2 focus-visible:outline-white"
        >
          ✕
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p role="status" className="rounded-full bg-black/55 px-5 py-2.5 text-base font-medium backdrop-blur">
          {hint}
        </p>
        <button
          type="button"
          onClick={() => void capture()}
          disabled={!ready || capturing}
          aria-label="撮影する"
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-black/20 transition active:scale-95 disabled:opacity-40"
        >
          <span className="h-15 w-15 rounded-full bg-white" />
        </button>
      </div>
    </div>
  );
}