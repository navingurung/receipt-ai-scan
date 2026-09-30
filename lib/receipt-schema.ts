export type TaxRate = 8 | 10;

export type ReceiptItem = {
  /** 商品名 */
  n: string;
  /** 数量 */
  q: number;
  /** 金額（数量分、レシート記載どおり。値引きはマイナス） */
  p: number;
  /** 税率 */
  r: TaxRate;
};

export type Receipt = {
  store: string | null;
  /** YYYY-MM-DDTHH:mm */
  date: string | null;
  /** レシート番号 */
  no: string | null;
  /** true = 内税（税込価格）, false = 外税（税抜価格） */
  inc: boolean;
  items: ReceiptItem[];
  tax8: number | null;
  tax10: number | null;
  total: number | null;
};

const nullableString = { type: ["string", "null"] } as const;
const nullableInteger = { type: ["integer", "null"] } as const;

export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    store: { ...nullableString, description: "Store name as printed" },
    date: { ...nullableString, description: "Purchase date-time, format YYYY-MM-DDTHH:mm" },
    no: { ...nullableString, description: "Receipt / transaction number" },
    inc: { type: "boolean", description: "true if item prices include tax (内税/税込), false if tax is added (外税)" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "string", description: "Item name as printed" },
          q: { type: "integer", description: "Quantity" },
          p: { type: "integer", description: "Line amount in yen for the whole quantity; negative for discounts" },
          r: { type: "integer", enum: [8, 10], description: "Tax rate for this line" },
        },
        required: ["n", "q", "p", "r"],
      },
    },
    tax8: { ...nullableInteger, description: "Printed 8% tax amount" },
    tax10: { ...nullableInteger, description: "Printed 10% tax amount" },
    total: { ...nullableInteger, description: "Total paid (合計). Never お預かり or お釣り" },
  },
  required: ["store", "date", "no", "inc", "items", "tax8", "tax10", "total"],
} as const;

export const RECEIPT_PROMPT = `You read Japanese store receipts for a tax-free refund system.
Extract only what is printed. Use null for anything unreadable. Never guess numbers.

Rules:
- items: every purchased line in order. p is the printed line amount (already multiplied by quantity). Discount lines (値引, 割引, クーポン) are separate items with a negative p and the rate of the item they discount.
- r: 8 for reduced-rate items (marked with ※, ＊, 軽, 8%, or as the receipt's legend says), otherwise 10.
- inc: true when prices include tax (内税, 税込, (内消費税)), false when tax is added below the subtotal (外税, 税抜).
- tax8 / tax10: the printed tax amount for each rate, not the taxable base.
- total: the amount charged (合計 / お買上げ金額). Ignore お預かり, お釣り, and payment lines.
- no: the receipt number (レシートNo, 伝票番号, 取引番号, No.).
- date: YYYY-MM-DDTHH:mm. Convert Japanese era dates (令和) to the Western year.`;

function toInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/[,¥￥\s]/g, ""));
    return Number.isFinite(parsed) ? Math.round(parsed) : null;
  }
  return null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

// AI の出力は型保証されないため、画面に渡す前に正規化する
export function normalizeReceipt(raw: unknown): Receipt {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(source.items) ? source.items : [];

  const items: ReceiptItem[] = rawItems.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const p = toInt(item.p);
    if (p === null) return [];
    return [
      {
        n: toText(item.n) ?? "",
        q: Math.max(1, toInt(item.q) ?? 1),
        p,
        r: toInt(item.r) === 8 ? 8 : 10,
      },
    ];
  });

  return {
    store: toText(source.store),
    date: toText(source.date),
    no: toText(source.no),
    inc: source.inc !== false,
    items,
    tax8: toInt(source.tax8),
    tax10: toInt(source.tax10),
    total: toInt(source.total),
  };
}
