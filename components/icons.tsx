type IconProps = { className?: string };

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function ScanIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...base}>
      <path d="M6 14V9a3 3 0 0 1 3-3h5M34 6h5a3 3 0 0 1 3 3v5M42 34v5a3 3 0 0 1-3 3h-5M14 42H9a3 3 0 0 1-3-3v-5" />
      <path d="M15 12h18v24l-3-2-3 2-3-2-3 2-3-2-3 2z" />
      <path d="M19 19h10M19 24h10M19 29h6" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...base}>
      <rect x="6" y="10" width="36" height="28" rx="3" />
      <circle cx="16" cy="19" r="3" />
      <path d="m6 32 10-9 8 7 6-5 12 10" />
    </svg>
  );
}

export function AddItemIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...base}>
      <path d="M8 16 24 8l16 8v16l-16 8-16-8z" />
      <path d="m8 16 16 8 16-8M24 24v16" />
      <circle cx="38" cy="38" r="7" fill="white" />
      <path d="M38 34.5v7M34.5 38h7" />
    </svg>
  );
}

export function PosIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} {...base}>
      <rect x="10" y="6" width="28" height="14" rx="2" />
      <path d="M15 11h10M31 11h2" />
      <path d="M8 26h32l2 16H6z" />
      <path d="M14 32h4M22 32h4M30 32h4M14 37h20" />
      <path d="M20 20v6M28 20v6" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function RetakeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 12a8 8 0 1 0 2.5-5.8" />
      <path d="M4 4v4h4" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}