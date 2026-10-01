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
  /** 値引額（この商品への値引き。正の数、なければ 0） */
  d: number;
  /** 金額（数量分・値引き後） */
  p: number;
  /** 税率 */
  r: TaxRate;
};

/** 商品以外の料金（サービス料・チャージ・送料など）。免税対象外だが合計には含まれる */
export type ReceiptFee = {
  /** 名称 */
  n: string;
  /** 数量 */
  q: number;
  /** 金額（レシート記載どおり） */
  p: number;
  /** 税率 */
  r: TaxRate;
  /** true = 税込金額, false = 税抜金額 */
  inc: boolean;
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
  /** 商品以外の料金 */
  fees: ReceiptFee[];
  /** 小計値引額（正の数） */
  sd: number;
  /** レシート記載の税額（税率ごとの合計。内税分と外税分の両方を含む） */
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
          d: { type: "integer", description: "Discount applied to this item as a positive number, 0 if none" },
          p: { type: "integer", description: "Line amount in yen after this item's discount" },
          r: { type: "integer", enum: [8, 10], description: "Tax rate for this line" },
        },
        required: ["n", "jan", "q", "u", "d", "p", "r"],
      },
    },
    fees: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "string", description: "Charge name as printed" },
          q: { type: "integer", description: "Quantity, 1 if not printed" },
          p: { type: "integer", description: "Charge amount as printed" },
          r: { type: "integer", enum: [8, 10], description: "Tax rate for this charge" },
          inc: { type: "boolean", description: "true if this amount already includes tax" },
        },
        required: ["n", "q", "p", "r", "inc"],
      },
    },
    sd: { type: "integer", description: "Discount applied to the subtotal as a positive number, 0 if none" },
    tax8: { ...nullableInteger, description: "Total printed 8% tax, counted once" },
    tax10: { ...nullableInteger, description: "Total printed 10% tax, counted once" },
    total: { ...nullableInteger, description: "Total charged (合計). Never お預かり or お釣り" },
    cnt: { ...nullableInteger, description: "Printed item count (点数), null if not printed" },
  },
  required: ["store", "date", "no", "tno", "inc", "items", "fees", "sd", "tax8", "tax10", "total", "cnt"],
} as const;

export const RECEIPT_PROMPT = `You read Japanese store receipts for a tax-free refund system.
Extract only what is printed. Use null for anything unreadable. Never guess or calculate numbers.

Items:
- One entry per purchased product, in printed order.
- n: product name. jan: the 8 or 13 digit code printed next to or above the product, else null.
- q: quantity (e.g. "6個", "×3"), default 1. u: the printed unit price (e.g. "単1,799", "@150"), else null.
- d: if a discount line (値引, 値引額, 割引, クーポン) directly follows a product, put that discount in d as a positive number (e.g. "-24" → 24) and do not create a separate item. Otherwise 0.
- p: the line amount after the discount (printed amount − d).
- r: 8 for reduced-rate items (marked ※, ＊, *, 軽, or as the receipt's legend says), otherwise 10.

Charges (fees):
- Charges that are not products go in fees, never in items: サービス料, チャージ, COVER CHARGE, 席料, お通し, 送料, 配送料, ラッピング料, 手数料.
- q: quantity (e.g. "@300 x 2" → 2), default 1. p: the printed charge amount ("@300 x 2  ¥600" → 600). r: its tax rate.
- inc: true if the charge is printed as tax-included (for example it appears in 内税対象額), otherwise false.

Receipt:
- inc: false if the subtotal is printed as tax-excluded (小計(税抜), 外税, 税抜) with tax added below it. This wins even if (内消費税等) is also printed near the total.
  true only if item prices include tax (内税, 税込, "内" next to item amounts) and no tax-excluded subtotal is printed. null if unclear.
- sd: only a discount applied to the whole subtotal (小計値引, 小計割引) that is NOT already subtracted from an item, as a positive number, else 0.
  Summary lines such as 値引合計, 商品代金, or "税率8%対象 -24" repeat item discounts. Never add them to sd.
- tax8 / tax10: the total consumption tax for each rate, not the taxable base. If the receipt prints separate tax lines for tax-included parts (内税) and tax-added parts (消費税等), add them. Lines in parentheses under the total that repeat the same tax (内消費税等) must not be added again. Use null if no tax is printed for that rate.
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
  return { n: "", jan: null, q: 1, u: null, d: 0, p: 0, r: rate };
}

export function createEmptyReceipt(): Receipt {
  return {
    store: null,
    date: null,
    no: null,
    tno: null,
    inc: null,
    items: [],
    fees: [],
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
    const q = Math.max(1, toInt(item.q) ?? 1);
    const d = Math.max(0, toInt(item.d) ?? 0);
    // 単価の印字がない場合（数量 1 など）は値引前の金額から求める
    const printedUnit = toInt(item.u);
    const u = printedUnit ?? ((p + d) % q === 0 ? (p + d) / q : null);
    return [{ n: toText(item.n) ?? "", jan: toJan(item.jan), q, u, d, p, r: toInt(item.r) === 8 ? 8 : 10 }];
  });

  const rawFees = Array.isArray(source.fees) ? source.fees : [];
  const fees: ReceiptFee[] = rawFees.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const fee = entry as Record<string, unknown>;
    const p = toInt(fee.p);
    if (p === null || p === 0) return [];
    return [
      {
        n: toText(fee.n) ?? "料金",
        q: Math.max(1, toInt(fee.q) ?? 1),
        p,
        r: toInt(fee.r) === 8 ? 8 : 10,
        inc: fee.inc === true,
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
    fees,
    sd: Math.max(0, toInt(source.sd) ?? 0),
    tax8: toInt(source.tax8),
    tax10: toInt(source.tax10),
    total: toInt(source.total),
    cnt: toInt(source.cnt),
  };
}