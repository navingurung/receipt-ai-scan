import type { Receipt, TaxRate } from "@/lib/receipt-schema";

export type RateRow = {
  rate: TaxRate;
  /** 税抜の対象額（商品＋料金、値引按分後） */
  amount: number;
  /** 税額（レシート記載を優先） */
  tax: number;
  taxSource: "printed" | "calculated";
};

export type IssueLevel = "error" | "warning" | "info";
export type Issue = { level: IssueLevel; message: string };

export type ReceiptSummary = {
  /** 商品の金額合計（値引後、レシート記載どおり） */
  linesTotal: number;
  /** 商品ごとの値引額の合計 */
  itemDiscountTotal: number;
  /** 商品以外の料金の合計 */
  feeTotal: number;
  rates: RateRow[];
  /** 消費税（レシート記載を優先） */
  taxTotal: number;
  /** 支払合計（レシート記載を優先） */
  total: number;
  /** 合計金額（税抜）= 支払合計 − 消費税 */
  netTotal: number;
  issues: Issue[];
  /** error がある場合は次へ進めない */
  blocked: boolean;
};

const RATES: TaxRate[] = [8, 10];
const DAY_MS = 24 * 60 * 60 * 1000;
/** 購入日から出国までの期限（リファンド方式） */
const REFUND_LIMIT_DAYS = 90;

export const yen = (value: number | null) => (value === null ? "—" : `¥${value.toLocaleString("ja-JP")}`);

// 端数処理は店舗ごとに異なるため、切り捨て・四捨五入・切り上げのいずれかと一致すれば正しいとみなす
function possibleTaxes(amount: number, rate: TaxRate, inclusive: boolean): number[] {
  if (amount === 0) return [0];
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

const addTo = (map: Map<TaxRate, number>, rate: TaxRate, value: number) => map.set(rate, (map.get(rate) ?? 0) + value);

export function summarizeReceipt(receipt: Receipt): ReceiptSummary {
  const issues: Issue[] = [];
  const itemsInclusive = receipt.inc !== false;

  if (receipt.inc === null) {
    issues.push({ level: "error", message: "内税・外税を判定できませんでした。税区分を選択してください。" });
  }
  if (receipt.items.length === 0) issues.push({ level: "error", message: "商品がありません。" });
  if (!receipt.no) issues.push({ level: "error", message: "レシート番号を入力してください。" });

  // 商品は小計値引を按分したうえで、税込部分（内税）と税抜部分（外税）に分ける
  const itemsByRate = new Map<TaxRate, number>();
  for (const item of receipt.items) addTo(itemsByRate, item.r, item.p);
  const discountedItems = allocateDiscount(itemsByRate, receipt.sd);

  const inclusive = new Map<TaxRate, number>();
  const exclusive = new Map<TaxRate, number>();
  for (const [rate, amount] of discountedItems) addTo(itemsInclusive ? inclusive : exclusive, rate, amount);
  // 料金（サービス料など）は料金ごとに内税・外税が異なる場合がある
  for (const fee of receipt.fees) addTo(fee.inc ? inclusive : exclusive, fee.r, fee.p);

  let expectedTotal = 0;
  const rates: RateRow[] = RATES.filter((rate) => inclusive.has(rate) || exclusive.has(rate)).map((rate) => {
    const gross = inclusive.get(rate) ?? 0;
    const base = exclusive.get(rate) ?? 0;
    const internal = possibleTaxes(gross, rate, true);
    const external = possibleTaxes(base, rate, false);
    const printed = rate === 8 ? receipt.tax8 : receipt.tax10;

    let internalTax = internal[0];
    let tax = internal[0] + external[0];
    let taxSource: RateRow["taxSource"] = "calculated";

    if (printed === null) {
      issues.push({ level: "warning", message: `${rate}% の税額が読み取れなかったため、計算値を表示しています。` });
    } else {
      // 内税分＋外税分の組み合わせのいずれかがレシート記載の税額と一致するか
      const match = internal.flatMap((i) => external.map((e) => ({ i, e }))).find(({ i, e }) => i + e === printed);
      if (match) internalTax = match.i;
      else {
        issues.push({
          level: "error",
          message: `${rate}% の税額が一致しません（レシート ${yen(printed)} / 計算 ${yen(tax)}）。金額を確認してください。`,
        });
      }
      tax = printed;
      taxSource = "printed";
    }

    // 合計 = 税抜部分 + 税込部分 + 上乗せされた税額
    expectedTotal += base + gross + (tax - internalTax);
    return { rate, amount: base + gross - internalTax, tax, taxSource };
  });

  const taxTotal = rates.reduce((sum, row) => sum + row.tax, 0);

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
    const feeQuantity = receipt.fees.reduce((sum, fee) => sum + fee.q, 0);
    // 点数にチャージ料などを含める店舗もあるため、料金の数量分までは許容
    const withinFees = receipt.cnt > quantity && receipt.cnt <= quantity + feeQuantity;
    if (quantity !== receipt.cnt && !withinFees) {
      issues.push({ level: "warning", message: `点数が一致しません（レシート ${receipt.cnt} 点 / 明細 ${quantity} 点）。` });
    }
  }

  receipt.items.forEach((item, index) => {
    if (item.u !== null && item.u * item.q - item.d !== item.p) {
      issues.push({ level: "warning", message: `${index + 1} 行目：単価 × 数量 − 値引額と金額が一致しません。` });
    }
  });

  // 日付の読み間違い（例：2026 → 2028）と、返金期限を過ぎた古いレシートを検出
  if (receipt.date) {
    const purchasedAt = new Date(receipt.date).getTime();
    if (!Number.isNaN(purchasedAt)) {
      if (purchasedAt > Date.now() + DAY_MS) {
        issues.push({ level: "warning", message: "日付が未来になっています。レシートの日付を確認してください。" });
      } else if (Date.now() - purchasedAt > REFUND_LIMIT_DAYS * DAY_MS) {
        issues.push({ level: "warning", message: `購入日から ${REFUND_LIMIT_DAYS} 日を超えています。日付を確認してください。` });
      }
    }
  }

  const total = receipt.total ?? expectedTotal;
  return {
    linesTotal: receipt.items.reduce((sum, item) => sum + item.p, 0),
    itemDiscountTotal: receipt.items.reduce((sum, item) => sum + item.d, 0),
    feeTotal: receipt.fees.reduce((sum, fee) => sum + fee.p, 0),
    rates,
    taxTotal,
    total,
    netTotal: total - taxTotal,
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
  const matches = (summary: ReceiptSummary) =>
    !summary.issues.some((issue) => issue.message.startsWith("合計が一致しません"));
  return matches(summarizeReceipt({ ...receipt, sd: 0 })) && !matches(summarizeReceipt(receipt))
    ? { ...receipt, sd: 0 }
    : receipt;
}