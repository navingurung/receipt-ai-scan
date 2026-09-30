import type { ReactNode } from "react";

type ActionTileContentProps = {
  icon: ReactNode;
  label: string;
  caption?: string;
};

// スマホは横並びの大きなボタン、iPad 以上は POS 風の大きなタイル
export const actionTileClassName =
  "group flex w-full items-center gap-4 rounded-2xl border border-line bg-paper px-5 py-4 text-left shadow-sm transition " +
  "active:scale-[0.98] hover:border-brand/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 " +
  "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "md:min-h-56 md:flex-col md:justify-center md:gap-5 md:px-6 md:py-8 md:text-center";

export function ActionTileContent({ icon, label, caption }: ActionTileContentProps) {
  return (
    <>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center md:h-24 md:w-24">{icon}</span>
      <span className="flex flex-col gap-1">
        <span className="text-lg font-bold text-ink md:text-xl">{label}</span>
        {caption && <span className="text-sm text-muted">{caption}</span>}
      </span>
    </>
  );
}