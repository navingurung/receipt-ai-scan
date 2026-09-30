export type TaxRate = 8 | 10;

export type ReceiptItem = {
  /** 商品名 */
  n: string;
  /** JAN コード（印字がなければ null） */
  jan: string | null;
  /** 数量 */
  q: number;
  /** 販売単価（レシート記載どおり。印字がなければ null） */
  u: number | null;
  /** 金額（数量分・明細値引き後、レシート記載どおり） */
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
  /** 事業者登録番号（T + 13 桁） */
  tno: string | null;
  /** true = 内税（税込）, false = 外税（税抜）, null = 判定できず */
  inc: boolean | null;
  items: ReceiptItem[];
  /** 小計値引額（正の数） */
  sd: number;
  /** レシート記載の税額 */
  tax8: number | null;
  tax10: number | null;
  /** レシート記載の合計 */
  total: number | null;
  /** レシート記載の買上点数 */
  cnt: number | null;
};

const nullableString = { type: ["string", "null"] } as const;
const nullableInteger = { type: ["integer", "null"] } as const;

export const RECEIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    store: { ...nullableString, description: "Store name as printed" },
    date: { ...nullableString, description: "Purchase date-time, format YYYY-MM-DDTHH:mm" },
    no: { ...nullableString, description: "Receipt / transaction number" },
    tno: { ...nullableString, description: "Invoice registration number: T followed by 13 digits" },
    inc: { type: ["boolean", "null"], description: "true = prices include tax, false = tax added, null = unclear" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "string", description: "Item name as printed" },
          jan: { ...nullableString, description: "8 or 13 digit product code printed with the item" },
          q: { type: "integer", description: "Quantity" },
          u: { ...nullableInteger, description: "Unit price as printed" },
          p: { type: "integer", description: "Line amount in yen after this item's own discounts" },
          r: { type: "integer", enum: [8, 10], description: "Tax rate for this line" },
        },
        required: ["n", "jan", "q", "u", "p", "r"],
      },
    },
    sd: { type: "integer", description: "Discount applied to the subtotal as a positive number, 0 if none" },
    tax8: { ...nullableInteger, description: "Printed 8% tax amount" },
    tax10: { ...nullableInteger, description: "Printed 10% tax amount" },
    total: { ...nullableInteger, description: "Total charged (合計). Never お預かり or お釣り" },
    cnt: { ...nullableInteger, description: "Printed item count (点数), null if not printed" },
  },
  required: ["store", "date", "no", "tno", "inc", "items", "sd", "tax8", "tax10", "total", "cnt"],
} as const;

export const RECEIPT_PROMPT = `You read Japanese store receipts for a tax-free refund system.
Extract only what is printed. Use null for anything unreadable. Never guess or calculate numbers.

Items:
- One entry per purchased product, in printed order.
- n: product name. jan: the 8 or 13 digit code printed next to or above the product, else null.
- q: quantity (e.g. "6個", "×3"), default 1. u: the printed unit price (e.g. "単1,799", "@150"), else null.
- p: the printed line amount. If a discount line (値引, 割引, クーポン) directly follows a product, subtract it from that product's p and do not create a separate item.
- r: 8 for reduced-rate items (marked ※, ＊, *, 軽, or as the receipt's legend says), otherwise 10.

Receipt:
- inc: true if prices include tax (内税, 税込, "内" next to amounts, (内消費税等)), false if tax is added below the subtotal (外税, 税抜, 小計(税抜)), null if unclear.
- sd: a discount applied to the whole subtotal (小計値引, 小計割引) as a positive number, else 0.
- tax8 / tax10: the printed tax amount for each rate (消費税等, 内税, 内消費税), not the taxable base.
- total: the amount charged (合計, お買上げ金額). Ignore お預かり, お釣り, and payment lines.
- no: the receipt number (伝票番号, レシートNo, 取引No, No.). Ignore barcode numbers and long # numbers.
- tno: the invoice registration number (登録番号 T + 13 digits).
- cnt: the printed item count (点数, 買上点数), else null.
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

function toJan(value: unknown): string | null {
  const digits = toText(value)?.replace(/\D/g, "") ?? "";
  return digits.length === 8 || digits.length === 13 ? digits : null;
}

export function createEmptyItem(rate: TaxRate = 10): ReceiptItem {
  return { n: "", jan: null, q: 1, u: null, p: 0, r: rate };
}

export function createEmptyReceipt(): Receipt {
  return {
    store: null,
    date: null,
    no: null,
    tno: null,
    inc: null,
    items: [],
    sd: 0,
    tax8: null,
    tax10: null,
    total: null,
    cnt: null,
  };
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
        jan: toJan(item.jan),
        q: Math.max(1, toInt(item.q) ?? 1),
        u: toInt(item.u),
        p,
        r: toInt(item.r) === 8 ? 8 : 10,
      },
    ];
  });

  return {
    store: toText(source.store),
    date: toText(source.date),
    no: toText(source.no),
    tno: toText(source.tno),
    inc: typeof source.inc === "boolean" ? source.inc : null,
    items,
    sd: Math.max(0, toInt(source.sd) ?? 0),
    tax8: toInt(source.tax8),
    tax10: toInt(source.tax10),
    total: toInt(source.total),
    cnt: toInt(source.cnt),
  };
}