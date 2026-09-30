import { normalizeReceipt, type Receipt } from "@/lib/receipt-schema";

const KEY = "receipt-ai-scan:draft";

export type Draft = { receipt: Receipt; savedAt: string };

export function saveDraft(receipt: Receipt): Draft {
  const draft: Draft = { receipt, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // 保存容量不足やプライベートモードでは保存しない
  }
  return draft;
}

export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { receipt?: unknown; savedAt?: unknown };
    if (typeof parsed.savedAt !== "string") return null;
    return { receipt: normalizeReceipt(parsed.receipt), savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 何もしない
  }
}
