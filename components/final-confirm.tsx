"use client";

import { useMemo } from "react";
import { summarizeReceipt, yen } from "@/lib/receipt-calc";
import type { Receipt } from "@/lib/receipt-schema";

type FinalConfirmProps = {
  receipt: Receipt;
  onBack: () => void;
  onConfirm: () => void;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

export function FinalConfirm({ receipt, onBack, onConfirm }: FinalConfirmProps) {
  const summary = useMemo(() => summarizeReceipt(receipt), [receipt]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6">
      <div className="rounded-xl border border-line bg-paper">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-b border-line p-5 text-sm">
          <dt className="text-muted">店舗名</dt>
          <dd className="font-medium">{receipt.store ?? "—"}</dd>
          <dt className="text-muted">日時</dt>
          <dd className="font-medium">{formatDate(receipt.date)}</dd>
          <dt className="text-muted">レシート番号</dt>
          <dd className="font-medium tabular-nums">{receipt.no ?? "—"}</dd>
          <dt className="text-muted">税の表示</dt>
          <dd className="font-medium">{receipt.inc ? "内税" : "外税"}</dd>
        </dl>

        <ul className="divide-y divide-line">
          {receipt.items.map((item, index) => (
            <li key={index} className="flex items-baseline gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.n || "（名称なし）"}</span>
              <span className="text-muted tabular-nums">×{item.q}</span>
              <span className="w-10 text-right text-xs text-muted">{item.r}%</span>
              <span className={`w-24 text-right tabular-nums ${item.p < 0 ? "text-shu" : ""}`}>{yen(item.p)}</span>
            </li>
          ))}
        </ul>

        <div className="border-t border-line p-5 text-sm tabular-nums">
          {summary.rates.map((row) => (
            <div key={row.rate} className="flex justify-between py-0.5 text-muted">
              <span>
                {row.rate}% 対象 {yen(row.gross)}
              </span>
              <span>消費税 {yen(row.tax)}</span>
            </div>
          ))}
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-medium">合計</span>
            <span className="text-3xl font-bold">{yen(receipt.total ?? summary.computedTotal)}</span>
          </div>
        </div>
      </div>

      {summary.warnings.length > 0 && (
        <p className="rounded-lg bg-shu-soft px-4 py-3 text-sm text-shu">
          未確認の注意事項が {summary.warnings.length} 件あります。前の画面で確認してください。
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line bg-paper px-5 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          修正する
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-shu px-5 py-3 text-sm font-semibold text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shu"
        >
          この内容で確定する
        </button>
      </div>
    </div>
  );
}
