const STEPS = ["読み取り", "免税品", "最終確認"] as const;

export function StepHeader({ current }: { current: 0 | 1 | 2 }) {
  return (
    <header className="border-b border-line bg-paper pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <p className="text-sm font-bold">
          SAMURAI TAX <span className="ml-1 font-medium text-muted">レシート読み取り</span>
        </p>
        <ol className="flex items-center gap-2 text-xs sm:ml-auto">
          {STEPS.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              {index > 0 && <span className="h-px w-5 bg-line" aria-hidden="true" />}
              <span
                aria-current={index === current ? "step" : undefined}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
                  index === current
                    ? "bg-ink text-paper"
                    : index < current
                      ? "bg-moss-soft text-moss"
                      : "text-muted"
                }`}
              >
                <span className="tabular-nums">{index + 1}</span>
                {label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}
