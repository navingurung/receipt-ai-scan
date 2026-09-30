type StepHeaderProps = {
  title: string;
  /** 0 始まりの現在ステップ */
  current: number;
  total?: number;
  onBack?: () => void;
  onClose?: () => void;
};

export function StepHeader({ title, current, total = 3, onBack, onClose }: StepHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-brand pt-[env(safe-area-inset-top)] text-white">
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-2 md:h-16">
        <div>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-11 items-center gap-1.5 rounded-lg px-3 text-base font-medium hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
            >
              <span aria-hidden="true">←</span>
              戻る
            </button>
          )}
        </div>
        <h1 className="text-lg font-bold md:text-xl">{title}</h1>
        <div className="flex justify-end">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="最初に戻る"
              className="flex h-11 w-11 items-center justify-center rounded-lg text-2xl hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <ol className="flex gap-2 px-4 pb-3" aria-label={`ステップ ${current + 1} / ${total}`}>
        {Array.from({ length: total }, (_, index) => (
          <li key={index} className={`h-1 flex-1 rounded-full ${index <= current ? "bg-white" : "bg-white/30"}`} />
        ))}
      </ol>
    </header>
  );
}