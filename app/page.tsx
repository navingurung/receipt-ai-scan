"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FinalConfirm } from "@/components/final-confirm";
import { ReceiptReview } from "@/components/receipt-review";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ScanPreview } from "@/components/scan-preview";
import { StepHeader } from "@/components/step-header";
import { clearDraft, loadDraft, saveDraft, type Draft } from "@/lib/draft-storage";
import { prepareImage } from "@/lib/image";
import { yen } from "@/lib/receipt-calc";
import { normalizeReceipt, type Receipt } from "@/lib/receipt-schema";

type Phase = "start" | "camera" | "analyzing" | "review" | "confirm" | "done";
type ScanStatus = "analyzing" | "done" | "error";
type Timing = { totalMs: number; aiMs: number; model: string };

const DONE_STAMP_MS = 600;

const STEP_BY_PHASE: Record<Phase, 0 | 1 | 2> = {
  start: 0,
  camera: 0,
  analyzing: 0,
  review: 1,
  confirm: 2,
  done: 2,
};

function extensionFor(type: string) {
  if (type === "image/heic") return "heic";
  if (type === "image/heif") return "heif";
  return "jpg";
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus>("analyzing");
  const [startedAt, setStartedAt] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const imageUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // localStorage はクライアントでのみ読める
    setDraft(loadDraft());
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  const replaceImage = useCallback((image: Blob | null) => {
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    const url = image ? URL.createObjectURL(image) : null;
    imageUrlRef.current = url;
    setImageUrl(url);
  }, []);

  const analyze = useCallback(async (image: Blob) => {
    const requestId = ++requestIdRef.current;
    const t0 = performance.now();
    setScanError(null);
    setScanStatus("analyzing");
    setStartedAt(t0);
    setPhase("analyzing");

    const form = new FormData();
    form.append("file", image, `receipt.${extensionFor(image.type)}`);

    try {
      const response = await fetch("/api/receipt-scan", { method: "POST", body: form });
      const data: unknown = await response.json().catch(() => null);
      if (requestId !== requestIdRef.current) return;

      const body = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof body.error === "string" ? body.error : `読み取りに失敗しました（${response.status}）`);
      }

      setReceipt(normalizeReceipt(body.receipt));
      setTiming({
        totalMs: Math.round(performance.now() - t0),
        aiMs: typeof body.aiMs === "number" ? body.aiMs : 0,
        model: typeof body.model === "string" ? body.model : "",
      });
      setDraftSavedAt(null);
      setScanStatus("done");
      window.setTimeout(() => {
        if (requestId === requestIdRef.current) setPhase("review");
      }, DONE_STAMP_MS);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setScanError(error instanceof Error ? error.message : "読み取りに失敗しました。");
      setScanStatus("error");
    }
  }, []);

  const handleImage = useCallback(
    async (source: Blob) => {
      setStartError(null);
      try {
        const prepared = await prepareImage(source);
        replaceImage(prepared);
        setPendingImage(prepared);
        await analyze(prepared);
      } catch (error) {
        setPhase("start");
        setStartError(error instanceof Error ? error.message : "画像を読み込めませんでした。");
      }
    },
    [analyze, replaceImage],
  );

  const reset = () => {
    requestIdRef.current++;
    replaceImage(null);
    setPendingImage(null);
    setReceipt(null);
    setTiming(null);
    setScanError(null);
    setDraftSavedAt(null);
    setDraft(loadDraft());
    setPhase("start");
  };

  const resumeDraft = () => {
    if (!draft) return;
    replaceImage(null);
    setReceipt(draft.receipt);
    setTiming(null);
    setDraftSavedAt(draft.savedAt);
    setPhase("review");
  };

  const confirm = () => {
    clearDraft();
    setDraft(null);
    setPhase("done");
  };

  return (
    <>
      <StepHeader current={STEP_BY_PHASE[phase]} />
      <main className="flex flex-1 flex-col">
        {(phase === "start" || phase === "camera") && (
          <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 py-10 md:flex-row md:gap-16">
            <div
              aria-hidden="true"
              className="relative h-72 w-44 overflow-hidden rounded-t-md bg-paper shadow-[0_30px_60px_-24px_rgb(27_36_51/0.4)] [clip-path:polygon(0_0,100%_0,100%_calc(100%-10px),92%_100%,84%_calc(100%-10px),76%_100%,68%_calc(100%-10px),60%_100%,52%_calc(100%-10px),44%_100%,36%_calc(100%-10px),28%_100%,20%_calc(100%-10px),12%_100%,4%_calc(100%-10px),0_100%)] md:h-96 md:w-60"
            >
              <div className="flex flex-col gap-2.5 p-5">
                <div className="mx-auto mb-2 h-3 w-2/3 rounded-sm bg-ink/80" />
                {[70, 55, 80, 45, 65, 50, 75, 40].map((width, index) => (
                  <div key={index} className="flex justify-between gap-3">
                    <div className="h-2 rounded-sm bg-line" style={{ width: `${width}%` }} />
                    <div className="h-2 w-8 rounded-sm bg-line" />
                  </div>
                ))}
                <div className="mt-3 flex justify-between border-t border-dashed border-line pt-3">
                  <div className="h-3 w-1/4 rounded-sm bg-ink/80" />
                  <div className="h-3 w-1/3 rounded-sm bg-ink/80" />
                </div>
              </div>
              <div className="scan-line" />
            </div>

            <div className="flex w-full max-w-sm flex-col gap-4">
              <h1 className="text-3xl leading-tight font-bold">レシートを読み取る</h1>
              <p className="text-sm leading-relaxed text-muted">
                レシート全体が写るように撮影するか、画像を選んでください。読み取り結果は次の画面で確認・修正できます。
              </p>

              <div className="mt-2 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStartError(null);
                    setPhase("camera");
                  }}
                  className="rounded-xl bg-ink px-5 py-4 text-base font-semibold text-paper transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  カメラで読み取る
                </button>
                <ReceiptUpload
                  onSelect={(file) => void handleImage(file)}
                  onError={setStartError}
                  className="rounded-xl border border-line bg-paper px-5 py-4 text-base font-semibold transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                >
                  画像を選ぶ
                </ReceiptUpload>
                {draft && (
                  <button
                    type="button"
                    onClick={resumeDraft}
                    className="text-sm font-medium text-muted underline underline-offset-4 hover:text-ink"
                  >
                    一時保存を再開（
                    {new Date(draft.savedAt).toLocaleString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    ）
                  </button>
                )}
              </div>

              {startError && (
                <p role="alert" className="text-sm font-medium text-shu">
                  {startError}
                </p>
              )}

              <p className="mt-4 border-l-2 border-shu pl-3 text-xs leading-relaxed text-muted">
                テスト（無料枠）中はサンプルやスタッフのレシートのみ使用してください。
              </p>
            </div>
          </div>
        )}

        {phase === "analyzing" && imageUrl && (
          <ScanPreview
            imageUrl={imageUrl}
            status={scanStatus}
            startedAt={startedAt}
            errorMessage={scanError}
            onRetry={pendingImage ? () => void analyze(pendingImage) : undefined}
            onRescan={reset}
          />
        )}

        {phase === "review" && receipt && (
          <ReceiptReview
            receipt={receipt}
            imageUrl={imageUrl}
            timing={timing}
            onChange={setReceipt}
            onSaveDraft={() => setDraftSavedAt(saveDraft(receipt).savedAt)}
            onRescan={reset}
            onNext={() => setPhase("confirm")}
            draftSavedAt={draftSavedAt}
          />
        )}

        {phase === "confirm" && receipt && (
          <FinalConfirm receipt={receipt} onBack={() => setPhase("review")} onConfirm={confirm} />
        )}

        {phase === "done" && receipt && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
            <span className="stamp-in rounded-md border-4 border-shu px-6 py-2 text-3xl font-bold tracking-widest text-shu">
              確定
            </span>
            <p className="text-sm text-muted">
              {receipt.store ?? "レシート"}
              <span className="ml-3 font-semibold text-ink tabular-nums">{yen(receipt.total ?? 0)}</span>
            </p>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl bg-ink px-6 py-3.5 text-base font-semibold text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              次のレシートを読み取る
            </button>
          </div>
        )}
      </main>

      {phase === "camera" && (
        <ReceiptScanner onCapture={(blob) => void handleImage(blob)} onClose={() => setPhase("start")} />
      )}
    </>
  );
}
