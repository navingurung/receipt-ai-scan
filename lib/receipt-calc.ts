import type { Receipt, TaxRate } from "@/lib/receipt-schema";

export type RateRow = {
  rate: TaxRate;
  /** 値引按分後の対象額（内税は税込、外税は税抜） */
  amount: number;
  /** 税額（レシート記載を優先） */
  tax: number;
  taxSource: "printed" | "calculated";
};

export type IssueLevel = "error" | "warning" | "info";
export type Issue = { level: IssueLevel; message: string };

export type ReceiptSummary = {
  linesTotal: number;
  rates: RateRow[];
  taxTotal: number;
  /** 合計（レシート記載を優先） */
  total: number;
  issues: Issue[];
  /** error がある場合は次へ進めない */
  blocked: boolean;
};

const RATES: TaxRate[] = [8, 10];

export const yen = (value: number | null) => (value === null ? "—" : `¥${value.toLocaleString("ja-JP")}`);

// 端数処理は店舗ごとに異なるため、切り捨て・四捨五入・切り上げのいずれかと一致すれば正しいとみなす
function possibleTaxes(amount: number, rate: TaxRate, inclusive: boolean): number[] {
  const raw = inclusive ? (amount * rate) / (100 + rate) : (amount * rate) / 100;
  return [...new Set([Math.floor(raw), Math.round(raw), Math.ceil(raw)])];
}

// 小計値引を税率ごとの金額比で按分（端数は金額の大きい税率に寄せる）
function allocateDiscount(amounts: Map<TaxRate, number>, discount: number): Map<TaxRate, number> {
  const sum = [...amounts.values()].reduce((a, b) => a + b, 0);
  if (discount <= 0 || sum <= 0) return amounts;

  const entries = [...amounts.entries()].sort(([, a], [, b]) => b - a);
  let remaining = Math.min(discount, sum);
  const result = new Map<TaxRate, number>();
  entries.forEach(([rate, amount], index) => {
    const share = index === entries.length - 1 ? remaining : Math.floor((discount * amount) / sum);
    remaining -= share;
    result.set(rate, amount - share);
  });
  return result;
}

export function summarizeReceipt(receipt: Receipt): ReceiptSummary {
  const issues: Issue[] = [];
  const inclusive = receipt.inc !== false;

  if (receipt.inc === null) {
    issues.push({ level: "error", message: "内税・外税を判定できませんでした。税区分を選択してください。" });
  }
  if (receipt.items.length === 0) issues.push({ level: "error", message: "商品がありません。" });
  if (!receipt.no) issues.push({ level: "error", message: "レシート番号を入力してください。" });

  const linesTotal = receipt.items.reduce((sum, item) => sum + item.p, 0);
  const byRate = new Map<TaxRate, number>();
  for (const item of receipt.items) byRate.set(item.r, (byRate.get(item.r) ?? 0) + item.p);
  const discounted = allocateDiscount(byRate, receipt.sd);

  const rates: RateRow[] = RATES.filter((rate) => discounted.has(rate)).map((rate) => {
    const amount = discounted.get(rate) ?? 0;
    const printed = rate === 8 ? receipt.tax8 : receipt.tax10;
    const candidates = possibleTaxes(amount, rate, inclusive);

    if (printed === null) {
      issues.push({ level: "warning", message: `${rate}% の税額が読み取れなかったため、計算値を表示しています。` });
      return { rate, amount, tax: candidates[0], taxSource: "calculated" };
    }
    if (!candidates.includes(printed)) {
      issues.push({
        level: "error",
        message: `${rate}% の税額が一致しません（レシート ${yen(printed)} / 計算 ${yen(candidates[0])}）。金額を確認してください。`,
      });
    }
    return { rate, amount, tax: printed, taxSource: "printed" };
  });

  const taxTotal = rates.reduce((sum, row) => sum + row.tax, 0);
  const base = rates.reduce((sum, row) => sum + row.amount, 0);
  const expectedTotal = inclusive ? base : base + taxTotal;

  if (receipt.total === null) {
    issues.push({ level: "warning", message: "合計金額が読み取れなかったため、計算値を表示しています。" });
  } else if (receipt.total !== expectedTotal) {
    const diff = Math.abs(receipt.total - expectedTotal);
    issues.push(
      diff <= rates.length
        ? { level: "info", message: `合計に ${yen(diff)} の端数差があります。レシート記載の金額を使用します。` }
        : {
            level: "error",
            message: `合計が一致しません（レシート ${yen(receipt.total)} / 明細から計算 ${yen(expectedTotal)}）。`,
          },
    );
  }

  if (receipt.cnt !== null) {
    const quantity = receipt.items.reduce((sum, item) => sum + item.q, 0);
    if (quantity !== receipt.cnt) {
      issues.push({ level: "warning", message: `点数が一致しません（レシート ${receipt.cnt} 点 / 明細 ${quantity} 点）。` });
    }
  }

  receipt.items.forEach((item, index) => {
    if (item.u === null) return;
    const gross = item.u * item.q;
    // 金額が単価×数量より小さいのは明細値引きなので正常。大きい場合のみ警告
    if (item.p > gross) {
      issues.push({ level: "warning", message: `${index + 1} 行目：金額が単価 × 数量を超えています。` });
    }
  });

  return {
    linesTotal,
    rates,
    taxTotal,
    total: receipt.total ?? expectedTotal,
    issues,
    blocked: issues.some((issue) => issue.level === "error"),
  };
}

/**
 * AI が明細値引きを小計値引にも重複計上した場合の補正。
 * 小計値引を 0 にするとレシート記載の合計と一致する場合のみ 0 に戻す。
 */
export function reconcileDiscount(receipt: Receipt): Receipt {
  if (receipt.sd === 0 || receipt.total === null) return receipt;
  const withoutDiscount = summarizeReceipt({ ...receipt, sd: 0 });
  const withDiscount = summarizeReceipt(receipt);
  const matches = (summary: ReceiptSummary) => !summary.issues.some((issue) => issue.message.startsWith("合計が一致しません"));
  return matches(withoutDiscount) && !matches(withDiscount) ? { ...receipt, sd: 0 } : receipt;
}