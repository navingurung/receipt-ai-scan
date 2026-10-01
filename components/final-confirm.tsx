"use client";

import { useMemo, type ReactNode } from "react";
import { summarizeReceipt, yen } from "@/lib/receipt-calc";
import type { Receipt } from "@/lib/receipt-schema";

type FinalConfirmProps = {
  receipt: Receipt;
  onBack: () => void;
  onSubmit: () => void;
};

function Row({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${strong ? "text-xl font-bold" : "text-base"}`}>
      <span className={strong ? "" : "text-muted"}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function FinalConfirm({ receipt, onBack, onSubmit }: FinalConfirmProps) {
  const summary = useMemo(() => summarizeReceipt(receipt), [receipt]);
  const taxLabel = receipt.inc ? "税込" : "税抜";

  return (
    <>
      <div className="flex flex-1 justify-center px-4 py-5 md:px-8 md:py-7">
        <article className="w-full max-w-2xl rounded-2xl border border-line bg-paper px-6 py-7 md:px-10">
          <header className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-xl font-bold">{receipt.store ?? "店舗名なし"}</h2>
            {receipt.date && <p className="text-muted tabular-nums">{receipt.date.replace("T", " ")}</p>}
            <p className="text-muted tabular-nums">レシート番号 {receipt.no ?? "—"}</p>
            {receipt.tno && <p className="text-xs text-muted tabular-nums">登録番号 {receipt.tno}</p>}
          </header>

          <hr className="my-6 border-dashed border-line" />

          <ol className="flex flex-col gap-6">
            {receipt.items.map((item, index) => (
              <li key={index} className="flex flex-col gap-1.5">
                <p className="text-lg font-bold">
                  No.{index + 1} {item.n || "（商品名なし）"}
                </p>
                <Row label="税率" value={`${item.r}%`} />
                <Row label="JANコード" value={item.jan ?? "—"} />
                <Row label="数量" value={item.q} />
                <Row label={`販売単価（${taxLabel}）`} value={yen(item.u)} />
                {item.d > 0 && <Row label="値引額" value={<span className="text-shu">−{yen(item.d)}</span>} />}
                <Row label="小計" value={yen(item.p)} />
              </li>
            ))}
          </ol>

          <hr className="my-6 border-dashed border-line" />

          <div className="flex flex-col gap-1.5">
            {summary.itemDiscountTotal > 0 && (
              <Row label="値引合計" value={<span className="text-shu">−{yen(summary.itemDiscountTotal)}</span>} />
            )}
            <Row label={`明細合計（${taxLabel}・値引後）`} value={yen(summary.linesTotal)} />
            {receipt.sd > 0 && <Row label="小計値引" value={`−${yen(receipt.sd)}`} />}
            <Row label={receipt.inc ? "内消費税" : "消費税"} value={yen(summary.taxTotal)} />
            <div className="mt-2">
              <Row label="合計（税込）" value={yen(summary.total)} strong />
            </div>
          </div>

          <hr className="my-6 border-dashed border-line" />

          <section className="flex flex-col gap-1.5">
            <h3 className="mb-1 text-base font-bold">税率別内訳</h3>
            {summary.rates.map((row) => (
              <div key={row.rate} className="flex flex-col gap-1.5">
                <Row label={`${row.rate}%対象（${taxLabel}）`} value={yen(row.amount)} />
                <Row label="消費税額" value={yen(row.tax)} />
              </div>
            ))}
          </section>
        </article>
      </div>

      <footer className="sticky bottom-0 z-10 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:px-8">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onBack}
            className="h-14 rounded-xl border border-line bg-paper text-base font-medium focus-visible:outline-2 focus-visible:outline-brand"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="h-14 rounded-xl bg-brand text-base font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            送信
          </button>
        </div>
      </footer>
    </>
  );
}