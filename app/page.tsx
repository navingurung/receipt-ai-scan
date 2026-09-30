"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionTileContent, actionTileClassName } from "@/components/action-tile";
import { FinalConfirm } from "@/components/final-confirm";
import { AddItemIcon, PosIcon, ScanIcon, UploadIcon } from "@/components/icons";
import { ReceiptReview } from "@/components/receipt-review";
import { ReceiptScanner } from "@/components/receipt-scanner";
import { ReceiptUpload } from "@/components/receipt-upload";
import { ScanPreview } from "@/components/scan-preview";
import { StepHeader } from "@/components/step-header";
import { clearDraft, loadDraft, saveDraft, type Draft } from "@/lib/draft-storage";
import { prepareImage } from "@/lib/image";
import { summarizeReceipt, yen } from "@/lib/receipt-calc";
import { createEmptyReceipt, normalizeReceipt, type Receipt } from "@/lib/receipt-schema";

type Phase = "start" | "camera" | "analyzing" | "review" | "confirm" | "done";
type ScanStatus = "analyzing" | "done" | "error";
type Timing = { totalMs: number; aiMs: number; model: string };

const DONE_STAMP_MS = 600;

const POS_LABELS: Record<string, string> = { shopify: "Shopify POS", smaregi: "スマレジ" };
const POS_NAME = POS_LABELS[process.env.NEXT_PUBLIC_POS_PROVIDER ?? ""] ?? "未連携";

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
  const [notice, setNotice] = useState<string | null>(null);
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
      setNotice(null);
      try {
        const prepared = await prepareImage(source);
        replaceImage(prepared);
        setPendingImage(prepared);
        await analyze(prepared);
      } catch (error) {
        setPhase("start");
        setNotice(error instanceof Error ? error.message : "画像を読み込めませんでした。");
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
    setNotice(null);
    setDraftSavedAt(null);
    setDraft(loadDraft());
    setPhase("start");
  };

  // 入力中のデータがある画面から離れるときは確認する
  const confirmDiscard = () => {
    if (!receipt || receipt.items.length === 0) return true;
    return window.confirm("入力内容を破棄して最初に戻りますか？");
  };

  const leave = () => {
    if (confirmDiscard()) reset();
  };

  const startManual = () => {
    replaceImage(null);
    setReceipt(createEmptyReceipt());
    setTiming(null);
    setDraftSavedAt(null);
    setPhase("review");
  };

  const resumeDraft = () => {
    if (!draft) return;
    replaceImage(null);
    setReceipt(draft.receipt);
    setTiming(null);
    setDraftSavedAt(draft.savedAt);
    setPhase("review");
  };

  const submit = () => {
    clearDraft();
    setDraft(null);
    setPhase("done");
  };

  const header = {
    start: <StepHeader title="レシート読み取り" current={0} />,
    camera: <StepHeader title="レシート読み取り" current={0} />,
    analyzing: <StepHeader title="読み取り中" current={0} onBack={reset} />,
    review: <StepHeader title="免税品" current={1} onBack={leave} onClose={leave} />,
    confirm: <StepHeader title="最終確認" current={2} onBack={() => setPhase("review")} onClose={leave} />,
    done: <StepHeader title="完了" current={2} />,
  }[phase];

  return (
    // PC でも iPad 幅（最大 1024px）で中央に表示する
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col bg-mist">
      {header}
      <main className="flex flex-1 flex-col">
        {(phase === "start" || phase === "camera") && (
          <div className="flex flex-1 flex-col gap-6 px-4 py-6 md:justify-center md:px-10 md:py-10">
            <p className="text-base text-muted md:text-center md:text-lg">操作を選択してください</p>

            <div className="grid gap-3 md:grid-cols-2 md:gap-6">
              <button
                type="button"
                onClick={() => {
                  setNotice(null);
                  setPhase("camera");
                }}
                className={actionTileClassName}
              >
                <ActionTileContent
                  icon={<ScanIcon className="h-full w-full text-brand" />}
                  label="レシートスキャン"
                  caption="カメラで撮影して読み取り"
                />
              </button>
              <ReceiptUpload onSelect={(file) => void handleImage(file)} onError={setNotice} className={actionTileClassName}>
                <ActionTileContent
                  icon={<UploadIcon className="h-full w-full text-tile-orange" />}
                  label="画像アップロード"
                  caption="保存済みの写真から読み取り"
                />
              </ReceiptUpload>
              <button type="button" onClick={startManual} className={actionTileClassName}>
                <ActionTileContent
                  icon={<AddItemIcon className="h-full w-full text-tile-green" />}
                  label="商品を追加"
                  caption="手入力で登録"
                />
              </button>
              <button
                type="button"
                onClick={() => setNotice(`POS連携（${POS_NAME}）は準備中です。`)}
                className={actionTileClassName}
              >
                <ActionTileContent
                  icon={<PosIcon className="h-full w-full text-tile-purple" />}
                  label="POS連携"
                  caption={POS_NAME}
                />
              </button>
            </div>

            {notice && (
              <p role="alert" className="rounded-xl bg-brand-soft px-4 py-3 text-sm font-medium text-brand md:text-center">
                {notice}
              </p>
            )}

            {draft && (
              <button
                type="button"
                onClick={resumeDraft}
                className="self-center text-base font-medium text-brand underline underline-offset-4"
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

            <p className="text-center text-xs text-muted">
              テスト（無料枠）中はサンプルやスタッフのレシートのみ使用してください。
            </p>
          </div>
        )}

        {phase === "analyzing" && imageUrl && (
          <ScanPreview
            imageUrl={imageUrl}
            status={scanStatus}
            startedAt={startedAt}
            errorMessage={scanError}
            onRetry={pendingImage ? () => void analyze(pendingImage) : undefined}
            onRescan={() => {
              reset();
              setPhase("camera");
            }}
          />
        )}

        {phase === "review" && receipt && (
          <ReceiptReview
            receipt={receipt}
            timing={timing}
            draftSavedAt={draftSavedAt}
            onChange={setReceipt}
            onSaveDraft={() => setDraftSavedAt(saveDraft(receipt).savedAt)}
            onRescan={() => {
              if (!confirmDiscard()) return;
              reset();
              setPhase("camera");
            }}
            onNext={() => setPhase("confirm")}
          />
        )}

        {phase === "confirm" && receipt && (
          <FinalConfirm receipt={receipt} onBack={() => setPhase("review")} onSubmit={submit} />
        )}

        {phase === "done" && receipt && (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
            <span className="stamp-in rounded-md border-4 border-brand px-6 py-2 text-3xl font-bold tracking-widest text-brand">
              送信済
            </span>
            <p className="text-base text-muted">
              {receipt.store ?? "レシート"}
              <span className="ml-3 font-semibold text-ink tabular-nums">{yen(summarizeReceipt(receipt).total)}</span>
            </p>
            <button
              type="button"
              onClick={reset}
              className="h-14 rounded-xl bg-brand px-8 text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              次のレシートを読み取る
            </button>
          </div>
        )}
      </main>

      {phase === "camera" && <ReceiptScanner onCapture={(blob) => void handleImage(blob)} onClose={() => setPhase("start")} />}
    </div>
  );
}