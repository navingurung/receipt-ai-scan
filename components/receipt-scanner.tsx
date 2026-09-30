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
const MANUAL_HINT_DELAY_MS = 3000;
const LOW_RESOLUTION = 1080;

const HINTS: Record<FrameVerdict | "waiting", string> = {
  waiting: "レシートを枠に合わせてください",
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
  const [showManualHint, setShowManualHint] = useState(false);
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
            width: { ideal: 1920 },
            height: { ideal: 1080 },
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

  // フレーム解析による自動撮影
  useEffect(() => {
    if (!ready) return;
    const video = videoRef.current;
    const frame = frameRef.current;
    if (!video || !frame) return;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

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
      const current = judgeFrame(stats);

      stable = current === "ok" ? stable + 1 : 0;
      setVerdict(current === "ok" && stable < DETECTION.stableFrames ? "moving" : current);
      setProgress(Math.min(1, stable / DETECTION.stableFrames));
      if (stable >= DETECTION.stableFrames) void capture();
    }, ANALYSIS_INTERVAL_MS);

    const hintTimer = window.setTimeout(() => setShowManualHint(true), MANUAL_HINT_DELAY_MS);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(hintTimer);
    };
  }, [ready, capture]);

  const handleClose = () => {
    stopStream();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black text-white">
      <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />

      {/* ガイド枠：外側を暗くしてレシートを枠いっぱいに合わせてもらう */}
      <div className="absolute inset-0 flex items-center justify-center px-6 pt-[max(4.5rem,env(safe-area-inset-top))] pb-[max(9rem,env(safe-area-inset-bottom))]">
        <div
          ref={frameRef}
          className="relative aspect-[5/8] h-full max-h-[78dvh] max-w-full rounded-lg"
          style={{ boxShadow: "0 0 0 100vmax rgb(0 0 0 / 0.58)" }}
        >
          {(["left-0 top-0 border-l-4 border-t-4 rounded-tl-lg", "right-0 top-0 border-r-4 border-t-4 rounded-tr-lg", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-lg", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-lg"] as const).map(
            (corner) => (
              <span
                key={corner}
                className={`absolute h-10 w-10 transition-colors duration-200 ${corner} ${
                  progress > 0 ? "border-shu" : "border-white"
                }`}
              />
            ),
          )}
          {ready && <div className="scan-line" />}
          <div
            className="absolute inset-x-6 bottom-4 h-1 overflow-hidden rounded-full bg-white/25"
            aria-hidden="true"
          >
            <div className="h-full bg-shu transition-[width] duration-100" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={handleClose}
          className="rounded-full bg-black/50 px-4 py-2 text-sm font-medium backdrop-blur focus-visible:outline-2 focus-visible:outline-white"
        >
          閉じる
        </button>
        {lowResolution && (
          <p className="rounded-full bg-black/50 px-3 py-1.5 text-xs backdrop-blur">
            カメラの解像度が低いため、精度が下がる場合があります
          </p>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <p role="status" className="rounded-full bg-black/55 px-4 py-2 text-sm font-medium backdrop-blur">
          {error ?? (ready ? HINTS[verdict] : "カメラを起動しています…")}
        </p>
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={() => void capture()}
            disabled={!ready}
            aria-label="撮影する"
            className={`h-18 w-18 rounded-full border-4 border-white bg-white/20 transition active:scale-95 disabled:opacity-40 ${
              showManualHint ? "pulse-ring" : ""
            }`}
          />
          {showManualHint && <span className="text-xs text-white/80">自動で撮影されない場合はタップ</span>}
        </div>
      </div>
    </div>
  );
}
