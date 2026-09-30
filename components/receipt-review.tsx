"use client";

import { useMemo, useState } from "react";
import { summarizeReceipt, yen } from "@/lib/receipt-calc";
import type { Receipt, ReceiptItem, TaxRate } from "@/lib/receipt-schema";

type ReceiptReviewProps = {
  receipt: Receipt;
  imageUrl: string | null;
  timing: { totalMs: number; aiMs: number; model: string } | null;
  onChange: (receipt: Receipt) => void;
  onSaveDraft: () => void;
  onRescan: () => void;
  onNext: () => void;
  draftSavedAt: string | null;
};

const inputClass =
  "w-full rounded-md border border-line bg-paper px-2.5 py-2 text-sm focus:border-ink focus:outline-none focus:ring-2 focus:ring-ink/15";

function toNumber(value: string, fallback: number) {
  const parsed = Number(value.replace(/[,¥￥\s]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function ReceiptReview({
  receipt,
  imageUrl,
  timing,
  onChange,
  onSaveDraft,
  onRescan,
  onNext,
  draftSavedAt,
}: ReceiptReviewProps) {
  const [showJson, setShowJson] = useState(false);
  const summary = useMemo(() => summarizeReceipt(receipt), [receipt]);

  const update = (patch: Partial<Receipt>) => onChange({ ...receipt, ...patch });

  const updateItem = (index: number, patch: Partial<ReceiptItem>) =>
    update({ items: receipt.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });

  const removeItem = (index: number) => update({ items: receipt.items.filter((_, i) => i !== index) });

  const addItem = () => update({ items: [...receipt.items, { n: "", q: 1, p: 0, r: 10 }] });

  return (
    <div
      className={`mx-auto grid w-full flex-1 gap-6 px-4 py-6 ${
        imageUrl ? "max-w-6xl lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]" : "max-w-4xl"
      }`}
    >
      {imageUrl && (
        <aside className="lg:sticky lg:top-6 lg:self-start">
          {/* eslint-disable-next-line @next/next/no-img-element -- ローカルの blob URL を表示 */}
          <img
            src={imageUrl}
            alt="読み取ったレシート"
            className="mx-auto max-h-[40dvh] w-auto rounded-lg border border-line bg-paper object-contain p-1.5 lg:max-h-[80dvh]"
          />
          {timing && (
            <p className="mt-3 text-center text-xs text-muted">
              <span className="font-semibold text-ink tabular-nums">{(timing.totalMs / 1000).toFixed(2)} 秒</span>
              <span className="mx-2">うち AI {(timing.aiMs / 1000).toFixed(2)} 秒</span>
              <span>{timing.model}</span>
            </p>
          )}
        </aside>
      )}

      <section className="flex min-w-0 flex-col gap-5">
        {summary.warnings.length > 0 && (
          <div role="alert" className="rounded-lg border border-shu/30 bg-shu-soft px-4 py-3 text-sm text-shu">
            <p className="font-semibold">内容を確認してください</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {summary.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-3 rounded-xl border border-line bg-paper p-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            店舗名
            <input
              className={inputClass}
              value={receipt.store ?? ""}
              onChange={(event) => update({ store: event.target.value || null })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            日時
            <input
              type="datetime-local"
              className={inputClass}
              value={receipt.date ?? ""}
              onChange={(event) => update({ date: event.target.value || null })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            レシート番号
            <input
              className={inputClass}
              value={receipt.no ?? ""}
              onChange={(event) => update({ no: event.target.value || null })}
            />
          </label>
          <fieldset className="flex items-center gap-4 text-sm sm:col-span-3">
            <legend className="sr-only">税の表示方法</legend>
            {[
              { value: true, label: "内税（税込価格）" },
              { value: false, label: "外税（税抜価格）" },
            ].map((option) => (
              <label key={option.label} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tax-mode"
                  checked={receipt.inc === option.value}
                  onChange={() => update({ inc: option.value })}
                  className="accent-ink"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line bg-paper">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-line bg-mist/60 text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2.5 font-medium">商品名</th>
                <th className="w-20 px-2 py-2.5 font-medium">数量</th>
                <th className="w-32 px-2 py-2.5 font-medium">金額</th>
                <th className="w-24 px-2 py-2.5 font-medium">税率</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item, index) => (
                <tr key={index} className="border-b border-line last:border-b-0">
                  <td className="px-3 py-2">
                    <input
                      aria-label={`${index + 1} 行目の商品名`}
                      className={inputClass}
                      value={item.n}
                      onChange={(event) => updateItem(index, { n: event.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`${index + 1} 行目の数量`}
                      inputMode="numeric"
                      className={`${inputClass} text-right tabular-nums`}
                      value={item.q}
                      onChange={(event) => updateItem(index, { q: Math.max(1, toNumber(event.target.value, item.q)) })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      aria-label={`${index + 1} 行目の金額`}
                      inputMode="numeric"
                      className={`${inputClass} text-right tabular-nums ${item.p < 0 ? "text-shu" : ""}`}
                      value={item.p}
                      onChange={(event) => updateItem(index, { p: toNumber(event.target.value, item.p) })}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      aria-label={`${index + 1} 行目の税率`}
                      className={inputClass}
                      value={item.r}
                      onChange={(event) => updateItem(index, { r: Number(event.target.value) as TaxRate })}
                    >
                      <option value={8}>8%</option>
                      <option value={10}>10%</option>
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      aria-label={`${index + 1} 行目を削除`}
                      className="rounded-md px-2 py-1 text-muted hover:bg-mist hover:text-shu focus-visible:outline-2 focus-visible:outline-ink"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            type="button"
            onClick={addItem}
            className="w-full border-t border-line px-3 py-2.5 text-left text-sm font-medium text-ink hover:bg-mist/60"
          >
            ＋ 商品を追加
          </button>
        </div>

        <div className="rounded-xl border border-line bg-paper p-4 text-sm">
          <table className="w-full tabular-nums">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-2 text-left font-medium">税率</th>
                <th className="pb-2 text-right font-medium">税抜</th>
                <th className="pb-2 text-right font-medium">消費税</th>
                <th className="pb-2 text-right font-medium">税込</th>
              </tr>
            </thead>
            <tbody>
              {summary.rates.map((row) => (
                <tr key={row.rate}>
                  <td className="py-1">{row.rate}%</td>
                  <td className="py-1 text-right">{yen(row.base)}</td>
                  <td className="py-1 text-right">{yen(row.tax)}</td>
                  <td className="py-1 text-right">{yen(row.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-muted">レシート合計</span>
            <span className="text-2xl font-bold tabular-nums">
              {receipt.total === null ? "—" : yen(receipt.total)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowJson((value) => !value)}
          className="self-start text-sm font-medium text-muted underline underline-offset-4 hover:text-ink"
        >
          {showJson ? "JSON を閉じる" : "JSON を表示"}
        </button>
        {showJson && (
          <pre className="max-h-96 overflow-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-paper">
            {JSON.stringify(receipt, null, 2)}
          </pre>
        )}

        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-mist/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
          <button
            type="button"
            onClick={onRescan}
            className="rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            撮り直す
          </button>
          <button
            type="button"
            onClick={onSaveDraft}
            className="rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            一時保存
          </button>
          {draftSavedAt && (
            <span className="text-xs text-muted">
              保存しました {new Date(draftSavedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={onNext}
            disabled={receipt.items.length === 0}
            className="ml-auto rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-paper disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            最終確認へ
          </button>
        </div>
      </section>
    </div>
  );
}
