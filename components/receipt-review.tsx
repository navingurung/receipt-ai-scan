"use client";

import { useMemo, useState } from "react";
import { PencilIcon, CloseIcon, PlusIcon, RetakeIcon, ScanIcon } from "@/components/icons";
import { summarizeReceipt, yen, type Issue } from "@/lib/receipt-calc";
import { createEmptyItem, type Receipt, type ReceiptItem, type TaxRate } from "@/lib/receipt-schema";

type Timing = { totalMs: number; aiMs: number; model: string };

type ReceiptReviewProps = {
  receipt: Receipt;
  timing: Timing | null;
  draftSavedAt: string | null;
  onChange: (receipt: Receipt) => void;
  onSaveDraft: () => void;
  onRescan: () => void;
  onNext: () => void;
};

const inputClass =
  "h-12 w-full rounded-xl border border-line bg-paper px-4 text-base focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/15";
const labelClass = "flex flex-col gap-1.5 text-sm font-medium text-ink";

const ISSUE_STYLES: Record<Issue["level"], string> = {
  error: "border-shu/30 bg-shu-soft text-shu",
  warning: "border-amber/30 bg-amber-soft text-amber",
  info: "border-brand/20 bg-brand-soft text-brand",
};

function toNumber(value: string): number | null {
  const cleaned = value.replace(/[,¥￥\s]/g, "");
  if (cleaned === "") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function priceLabel(inc: boolean | null) {
  if (inc === null) return "";
  return inc ? "税込" : "税抜";
}

function formatDate(value: string | null) {
  if (!value) return null;
  return value.replace("T", " ");
}

export function ReceiptReview({
  receipt,
  timing,
  draftSavedAt,
  onChange,
  onSaveDraft,
  onRescan,
  onNext,
}: ReceiptReviewProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const summary = useMemo(() => summarizeReceipt(receipt), [receipt]);
  const taxLabel = priceLabel(receipt.inc);

  const update = (patch: Partial<Receipt>) => onChange({ ...receipt, ...patch });

  const addItem = () => {
    update({ items: [...receipt.items, createEmptyItem()] });
    setEditingIndex(receipt.items.length);
  };

  const saveItem = (index: number, item: ReceiptItem) => {
    update({ items: receipt.items.map((current, i) => (i === index ? item : current)) });
    setEditingIndex(null);
  };

  const removeItem = (index: number) => {
    update({ items: receipt.items.filter((_, i) => i !== index) });
    setEditingIndex(null);
  };

  const cancelEdit = (index: number) => {
    const item = receipt.items[index];
    // 追加直後の空の商品はキャンセル時に削除
    if (item && item.n === "" && item.p === 0) removeItem(index);
    else setEditingIndex(null);
  };

  const meta = [receipt.store, formatDate(receipt.date)].filter(Boolean).join("  ");

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 px-4 py-5 md:px-8 md:py-7">
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onRescan}
            className="flex h-14 items-center justify-center gap-2 rounded-full border border-line bg-paper text-base font-medium focus-visible:outline-2 focus-visible:outline-brand"
          >
            <RetakeIcon className="h-5 w-5" />
            再撮影
          </button>
          <button
            type="button"
            onClick={addItem}
            disabled={editingIndex !== null}
            className="flex h-14 items-center justify-center gap-2 rounded-full border border-line bg-paper text-base font-medium disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand"
          >
            <PlusIcon className="h-5 w-5" />
            商品を追加
          </button>
        </div>

        {(meta || receipt.inc !== null) && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {meta && <span>{meta}</span>}
            {receipt.inc !== null && (
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
                {receipt.inc ? "内税（税込）" : "外税（税抜）"}
              </span>
            )}
            {receipt.tno && <span className="text-xs">登録番号 {receipt.tno}</span>}
          </p>
        )}

        {summary.issues.length > 0 && (
          <ul className="flex flex-col gap-2" aria-live="polite">
            {summary.issues.map((issue) => (
              <li key={issue.message} className={`rounded-xl border px-4 py-3 text-sm font-medium ${ISSUE_STYLES[issue.level]}`}>
                {issue.message}
              </li>
            ))}
          </ul>
        )}

        {/* 判定できなかった場合のみ税区分を選択してもらう */}
        {receipt.inc === null && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">税区分</legend>
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-paper p-1">
              {[
                { value: true, label: "内税（税込）" },
                { value: false, label: "外税（税抜）" },
              ].map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => update({ inc: option.value })}
                  className="h-12 rounded-lg text-base font-medium text-muted hover:bg-mist"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className={labelClass}>
          <span>
            レシート番号 <span className="text-shu">*</span>
          </span>
          <input
            className={inputClass}
            value={receipt.no ?? ""}
            onChange={(event) => update({ no: event.target.value || null })}
          />
        </label>

        <div className="flex items-center justify-between rounded-xl border border-line bg-paper px-5 py-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted">合計金額（レシート記載）</span>
            <span className="text-xs text-muted">
              {receipt.inc ? "内消費税" : "消費税"} {yen(summary.taxTotal)}
            </span>
          </div>
          <span className="text-3xl font-bold tabular-nums">{yen(summary.total)}</span>
        </div>

        <label className={labelClass}>
          小計値引額
          <input
            inputMode="numeric"
            className={`${inputClass} tabular-nums`}
            value={receipt.sd || ""}
            placeholder="0"
            onChange={(event) => update({ sd: Math.max(0, toNumber(event.target.value) ?? 0) })}
          />
          <span className="text-xs font-normal text-muted">入力した値引額は税率ごとの金額に按分されます</span>
        </label>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold">追加された商品（{receipt.items.length}）</h2>

          {receipt.items.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line bg-paper px-6 py-12 text-center">
              <p className="text-muted">現在、商品が追加されていません</p>
              <div className="flex w-full max-w-sm flex-col gap-3">
                <button
                  type="button"
                  onClick={onRescan}
                  className="flex h-14 items-center justify-center gap-2 rounded-full bg-brand text-base font-semibold text-white"
                >
                  <ScanIcon className="h-6 w-6" />
                  レシートスキャン
                </button>
                <button
                  type="button"
                  onClick={addItem}
                  className="flex h-14 items-center justify-center gap-2 rounded-full border border-line bg-paper text-base font-medium"
                >
                  <PlusIcon className="h-5 w-5" />
                  商品を追加
                </button>
              </div>
            </div>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2 md:gap-4">
              {receipt.items.map((item, index) =>
                editingIndex === index ? (
                  <ItemEditor
                    key={index}
                    item={item}
                    taxLabel={taxLabel}
                    onSave={(next) => saveItem(index, next)}
                    onCancel={() => cancelEdit(index)}
                  />
                ) : (
                  <ItemCard
                    key={index}
                    item={item}
                    taxLabel={taxLabel}
                    disabled={editingIndex !== null}
                    onEdit={() => setEditingIndex(index)}
                    onRemove={() => removeItem(index)}
                  />
                ),
              )}
            </ul>
          )}
        </section>

        {timing && (
          <details className="text-sm text-muted">
            <summary className="cursor-pointer select-none">
              デバッグ情報（読み取り {(timing.totalMs / 1000).toFixed(2)} 秒）
            </summary>
            <p className="mt-2">
              AI {(timing.aiMs / 1000).toFixed(2)} 秒 / {timing.model}
            </p>
            <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-ink p-4 text-xs leading-relaxed text-paper">
              {JSON.stringify(receipt, null, 2)}
            </pre>
          </details>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:px-8">
        {summary.blocked && editingIndex === null && (
          <p className="mb-2 text-center text-xs text-shu">赤いエラーを解消すると次へ進めます</p>
        )}
        {draftSavedAt && (
          <p className="mb-2 text-center text-xs text-muted">
            一時保存しました（
            {new Date(draftSavedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}）
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onSaveDraft}
            className="h-14 rounded-xl border border-line bg-paper text-base font-medium focus-visible:outline-2 focus-visible:outline-brand"
          >
            一時保存
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={summary.blocked || editingIndex !== null}
            className="h-14 rounded-xl bg-brand text-base font-semibold text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            次へ
          </button>
        </div>
      </footer>
    </>
  );
}

type ItemCardProps = {
  item: ReceiptItem;
  taxLabel: string;
  disabled: boolean;
  onEdit: () => void;
  onRemove: () => void;
};

function ItemCard({ item, taxLabel, disabled, onEdit, onRemove }: ItemCardProps) {
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-paper p-5">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 pt-2 text-lg font-bold break-words">{item.n || "（商品名なし）"}</p>
        <button
          type="button"
          onClick={onEdit}
          disabled={disabled}
          aria-label={`${item.n || "商品"}を編集`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line text-ink disabled:opacity-40"
        >
          <PencilIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`${item.n || "商品"}を削除`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-shu-soft text-shu disabled:opacity-40"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <dl className="mt-3 mb-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
        <dt className="text-muted">税率</dt>
        <dd>{item.r}%</dd>
        <dt className="text-muted">JANコード</dt>
        <dd className="tabular-nums">{item.jan ?? "—"}</dd>
        <dt className="text-muted">販売単価{taxLabel && `（${taxLabel}）`}</dt>
        <dd className="tabular-nums">{yen(item.u)}</dd>
        {item.d > 0 && (
          <>
            <dt className="text-muted">値引額</dt>
            <dd className="text-shu tabular-nums">−{yen(item.d)}</dd>
          </>
        )}
      </dl>

      <div className="mt-auto flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-sm text-muted">数量 {item.q}</span>
        <span>
          <span className="text-xl font-bold tabular-nums">{yen(item.p)}</span>
          {taxLabel && <span className="ml-1.5 text-xs text-muted">（{taxLabel}）</span>}
        </span>
      </div>
    </li>
  );
}

type ItemEditorProps = {
  item: ReceiptItem;
  taxLabel: string;
  onSave: (item: ReceiptItem) => void;
  onCancel: () => void;
};

function ItemEditor({ item, taxLabel, onSave, onCancel }: ItemEditorProps) {
  const [draft, setDraft] = useState(item);

  // 単価・数量・値引額を変えたら金額を再計算（金額は直接修正も可能）
  const setPricing = (patch: Partial<Pick<ReceiptItem, "u" | "q" | "d">>) =>
    setDraft((current) => {
      const next = { ...current, ...patch };
      return next.u !== null ? { ...next, p: next.u * next.q - next.d } : next;
    });

  return (
    <li className="flex flex-col gap-4 rounded-2xl border-2 border-brand bg-paper p-5 md:col-span-2">
      <label className={labelClass}>
        商品名
        <input className={inputClass} value={draft.n} onChange={(event) => setDraft({ ...draft, n: event.target.value })} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          JANコード
          <input
            inputMode="numeric"
            className={`${inputClass} tabular-nums`}
            value={draft.jan ?? ""}
            onChange={(event) => setDraft({ ...draft, jan: event.target.value.replace(/\D/g, "") || null })}
          />
        </label>
        <label className={labelClass}>
          税率
          <select
            className={inputClass}
            value={draft.r}
            onChange={(event) => setDraft({ ...draft, r: Number(event.target.value) as TaxRate })}
          >
            <option value={10}>10%</option>
            <option value={8}>8%（軽減税率）</option>
          </select>
        </label>
        <label className={labelClass}>
          販売単価{taxLabel && `（${taxLabel}）`}
          <input
            inputMode="numeric"
            className={`${inputClass} tabular-nums`}
            value={draft.u ?? ""}
            onChange={(event) => setPricing({ u: toNumber(event.target.value) })}
          />
        </label>
        <label className={labelClass}>
          数量
          <input
            inputMode="numeric"
            className={`${inputClass} tabular-nums`}
            value={draft.q}
            onChange={(event) => setPricing({ q: Math.max(1, toNumber(event.target.value) ?? 1) })}
          />
        </label>
      </div>
      <label className={labelClass}>
        値引額
        <input
          inputMode="numeric"
          className={`${inputClass} tabular-nums`}
          value={draft.d || ""}
          placeholder="0"
          onChange={(event) => setPricing({ d: Math.max(0, toNumber(event.target.value) ?? 0) })}
        />
      </label>
      <label className={labelClass}>
        金額（値引後{taxLabel && `・${taxLabel}`}）
        <input
          inputMode="numeric"
          className={`${inputClass} tabular-nums`}
          value={draft.p}
          onChange={(event) => setDraft({ ...draft, p: toNumber(event.target.value) ?? 0 })}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={onCancel} className="h-12 rounded-xl border border-line text-base font-medium">
          キャンセル
        </button>
        <button type="button" onClick={() => onSave(draft)} className="h-12 rounded-xl bg-brand text-base font-semibold text-white">
          保存
        </button>
      </div>
    </li>
  );
}