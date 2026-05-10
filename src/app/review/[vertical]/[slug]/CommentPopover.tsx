// src/app/review/[vertical]/[slug]/CommentPopover.tsx
"use client";

interface Props {
  rect: DOMRect;
  onClick: () => void;
}

export function CommentPopover({ rect, onClick }: Props) {
  const top = rect.top + window.scrollY - 44;
  const left = rect.left + window.scrollX + rect.width / 2 - 60;

  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent the click from collapsing the selection before our handler runs.
        e.preventDefault();
      }}
      onClick={onClick}
      style={{
        position: "absolute",
        top,
        left,
        zIndex: 50,
      }}
      className="border-2 border-ink bg-cream px-3 py-1.5 rounded-sharp shadow-md font-mono text-meta-sm uppercase tracking-mono-wide hover:bg-ink hover:text-cream transition-colors"
    >
      💬 Comment
    </button>
  );
}
