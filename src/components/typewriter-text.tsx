"use client";

import { useEffect, useState } from "react";

interface Props {
  text: string;
  delayMs?: number;
  charMs?: number;
  className?: string;
}

export function TypewriterText({ text, delayMs = 0, charMs = 50, className }: Props) {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    const start = setTimeout(() => {
      let i = 0;
      const id = setInterval(() => {
        if (i <= text.length) {
          setDisplay(text.slice(0, i));
          i++;
        } else {
          clearInterval(id);
        }
      }, charMs);
    }, delayMs);
    return () => clearTimeout(start);
  }, [text, delayMs, charMs]);

  return (
    <span aria-label={text} className={className}>
      <span aria-hidden="true">{display}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
