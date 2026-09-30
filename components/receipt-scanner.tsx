"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DETECTION, analyzeFrame, judgeFrame, mapElementRectToVideo, type FrameVerdict } from "@/lib/frame-analysis";
import { canvasToJpeg, scaleToFit } from "@/lib/image";

type ReceiptScannerProps = {
  onCapture: (image: Blob) => void;
  onClose: () => void;
};

const ANALYSIS_WIDTH = 160;
const ANALYSIS_INTERVAL_MS = 100;
const LOW_RESOLUTION = 1080;

const HINTS: Record<FrameVerdict | "waiting", string> = {
  waiting: "レシート全体を枠に合わせてください",
  noReceipt: "レシート全体を枠に合わせてください",
  dark: "暗すぎます。明るい場所で撮影してください",
  bright: "反射しています。角度を少し変えてください",
  moving: "そのまま動かさないでください",
  blurry: "ピントを合わせています…",
  ok: "撮影します",
};

export function ReceiptScanner({ onCapture, onClose }: ReceiptScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const capturedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<FrameVerdict | "waiting">("waiting");
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

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame || capturedRef.current || !video.videoWidth) return;
    capturedRef.current = true;

    const crop = mapElementRectToVideo(video, frame);
    const size = scaleToFit(crop.width, crop.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);

    try {
      const blob = await canvasToJpeg(canvas);
      stopStream();
      onCapture(blob);
    } catch {
      capturedRef.current = false;
      setError("撮影に失敗しました。もう一度お試しください。");
    }
  }, [onCapture, stopStream]);

  // フレーム解析による自動撮影（レシートが枠内で約 1.5 秒静止したら撮影）
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

      const current = judgeFrame(stats);
      stable = current === "ok" ? stable + 1 : 0;
      setVerdict(current === "ok" && stable < DETECTION.stableFrames ? "moving" : current);
      setProgress(Math.min(1, stable / DETECTION.stableFrames));
      if (stable >= DETECTION.stableFrames) void capture();
    }, ANALYSIS_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [ready, capture]);

  const handleClose = () => {
    stopStream();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white">
      <div className="flex items-center justify-end px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <button
          type="button"
          onClick={handleClose}
          aria-label="閉じる"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-2xl backdrop-blur focus-visible:outline-2 focus-visible:outline-white"
        >
          ✕
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div
            ref={frameRef}
            className="relative aspect-[5/8] h-full max-h-full max-w-full rounded-md"
            style={{ boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.5)" }}
          >
            {/* 3×3 グリッド */}
            <div className="pointer-events-none absolute inset-0" aria-hidden="true">
              <span className="absolute inset-y-0 left-1/3 w-px bg-white/45" />
              <span className="absolute inset-y-0 left-2/3 w-px bg-white/45" />
              <span className="absolute inset-x-0 top-1/3 h-px bg-white/45" />
              <span className="absolute inset-x-0 top-2/3 h-px bg-white/45" />
            </div>
            {(
              [
                "left-0 top-0 border-l-4 border-t-4 rounded-tl-md",
                "right-0 top-0 border-r-4 border-t-4 rounded-tr-md",
                "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-md",
                "right-0 bottom-0 border-r-4 border-b-4 rounded-br-md",
              ] as const
            ).map((corner) => (
              <span
                key={corner}
                className={`absolute h-10 w-10 transition-colors duration-200 ${corner} ${
                  progress > 0 ? "border-scan" : "border-white"
                }`}
              />
            ))}
            <div className="absolute inset-x-6 bottom-4 h-1.5 overflow-hidden rounded-full bg-white/25" aria-hidden="true">
              <div className="h-full bg-scan transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        </div>

        {lowResolution && (
          <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-xs whitespace-nowrap">
            カメラの解像度が低いため、精度が下がる場合があります
          </p>
        )}
      </div>

      <div className="flex flex-col items-center gap-4 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p role="status" className="text-sm font-medium">
          {error ?? (ready ? HINTS[verdict] : "カメラを起動しています…")}
        </p>
        <button
          type="button"
          onClick={() => void capture()}
          disabled={!ready}
          aria-label="撮影する"
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white transition active:scale-95 disabled:opacity-40"
        >
          <span className="h-15 w-15 rounded-full bg-white" />
        </button>
      </div>
    </div>
  );
}