import type { Receipt, TaxRate } from "@/lib/receipt-schema";

export type RateSummary = {
  rate: TaxRate;
  /** 税抜 */
  base: number;
  /** 消費税 */
  tax: number;
  /** 税込 */
  gross: number;
};

export type ReceiptSummary = {
  rates: RateSummary[];
  computedTotal: number;
  warnings: string[];
};

const RATES: TaxRate[] = [8, 10];
/** 端数処理の差を許容する円数（税率ごと） */
const TOLERANCE_PER_RATE = 1;

const yen = (value: number) => `¥${value.toLocaleString("ja-JP")}`;

/**
 * 内税: 記載金額 = 税込。税額は割り戻しで計算（切り捨て）。
 * 外税: 記載金額 = 税抜。税額を上乗せ（切り捨て）。
 * 内税の金額を税抜として扱わないこと（二重課税の計算ミスになる）。
 */
export function summarizeReceipt(receipt: Receipt): ReceiptSummary {
  const rates = RATES.flatMap((rate) => {
    const amount = receipt.items.filter((item) => item.r === rate).reduce((sum, item) => sum + item.p, 0);
    if (amount === 0 && !receipt.items.some((item) => item.r === rate)) return [];

    if (receipt.inc) {
      const tax = Math.floor((amount * rate) / (100 + rate));
      return [{ rate, base: amount - tax, tax, gross: amount }];
    }
    const tax = Math.floor((amount * rate) / 100);
    return [{ rate, base: amount, tax, gross: amount + tax }];
  });

  const computedTotal = rates.reduce((sum, row) => sum + row.gross, 0);
  const warnings: string[] = [];

  if (receipt.items.length === 0) warnings.push("商品が読み取れませんでした。");
  if (!receipt.no) warnings.push("レシート番号が読み取れませんでした。");
  if (!receipt.date) warnings.push("日付が読み取れませんでした。");

  if (receipt.total === null) {
    warnings.push("合計金額が読み取れませんでした。");
  } else if (Math.abs(receipt.total - computedTotal) > TOLERANCE_PER_RATE * Math.max(1, rates.length)) {
    warnings.push(`合計が一致しません（計算 ${yen(computedTotal)} / レシート ${yen(receipt.total)}）。`);
  }

  for (const row of rates) {
    const printed = row.rate === 8 ? receipt.tax8 : receipt.tax10;
    if (printed !== null && Math.abs(printed - row.tax) > TOLERANCE_PER_RATE) {
      warnings.push(`${row.rate}% の税額が一致しません（計算 ${yen(row.tax)} / レシート ${yen(printed)}）。`);
    }
  }

  return { rates, computedTotal, warnings };
}

export { yen };
