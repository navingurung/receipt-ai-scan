"use client";

import { useEffect, useState } from "react";

type ScanPreviewProps = {
  imageUrl: string;
  status: "analyzing" | "done" | "error";
  startedAt: number;
  errorMessage?: string | null;
  onRetry?: () => void;
  onRescan?: () => void;
};

export function ScanPreview({ imageUrl, status, startedAt, errorMessage, onRetry, onRescan }: ScanPreviewProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (status !== "analyzing") return;
    const timer = window.setInterval(() => setElapsed(performance.now() - startedAt), 50);
    return () => window.clearInterval(timer);
  }, [status, startedAt]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
      <div className="relative overflow-hidden rounded-xl bg-paper p-2 shadow-[0_24px_60px_-20px_rgb(27_36_51/0.45)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- ローカルの blob URL を表示 */}
        <img
          src={imageUrl}
          alt="撮影したレシート"
          className={`block max-h-[78dvh] w-auto max-w-[min(92vw,640px)] rounded-lg object-contain transition ${
            status === "error" ? "opacity-50 grayscale" : ""
          }`}
        />
        {status === "analyzing" && (
          <div className="pointer-events-none absolute inset-2 overflow-hidden rounded-lg">
            <div className="scan-trail" />
            <div className="scan-line scan-line-fast" />
          </div>
        )}
        {status === "done" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-paper/40">
            <span className="stamp-in rounded-md border-4 border-brand bg-paper/80 px-5 py-2 text-3xl font-bold tracking-widest text-brand">
              読取済
            </span>
          </div>
        )}
      </div>

      <div role="status" aria-live="polite" className="flex min-h-12 flex-col items-center gap-3 text-center">
        {status === "analyzing" && (
          <p className="text-base font-medium">
            レシートを読み取っています…
            <span className="ml-3 tabular-nums text-muted">{(elapsed / 1000).toFixed(1)} 秒</span>
          </p>
        )}
        {status === "error" && (
          <>
            <p className="max-w-md text-sm font-medium text-shu">{errorMessage ?? "読み取りに失敗しました。"}</p>
            <div className="flex gap-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="h-12 rounded-xl bg-brand px-6 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  もう一度読み取る
                </button>
              )}
              {onRescan && (
                <button
                  type="button"
                  onClick={onRescan}
                  className="h-12 rounded-xl border border-line bg-paper px-6 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  撮り直す
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}