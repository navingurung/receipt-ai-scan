"use client";

import { useRef, type ChangeEvent, type ReactNode } from "react";

const MAX_FILE_SIZE = 25 * 1024 * 1024;

type ReceiptUploadProps = {
  onSelect: (image: File) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

export function ReceiptUpload({ onSelect, onError, disabled = false, children, className }: ReceiptUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを再選択できるようにリセット
    event.target.value = "";
    if (!file) return;

    const looksLikeImage = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
    if (!looksLikeImage) {
      onError("画像ファイルを選択してください。");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      onError("25 MB 以下の画像を選択してください。");
      return;
    }
    onSelect(file);
  };

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className={className}>
        {children}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        onChange={handleChange}
        className="hidden"
      />
    </>
  );
}
