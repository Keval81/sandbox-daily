"use client";

import { useState } from "react";
import { type Vertical } from "@/lib/types";
import { verticals } from "@/lib/verticals";

interface SubscribeStripProps {
  vertical?: Vertical;
  headline?: string;
  subtext?: string;
}

export function SubscribeStrip({
  vertical = "news",
  headline = "Intelligence, Delivered",
  subtext = "The sharpest analysis across News, Tech and Sport — direct to your inbox.",
}: SubscribeStripProps) {
  const config = verticals[vertical];
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent">("idle");

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email) return;
    // No backend wired yet — show success state so the form isn't a dead button.
    setStatus("sent");
  };

  return (
    <section className={`${config.bg} ${config.text} py-16 px-6`}>
      <div className="mx-auto max-w-[1440px] text-center">
        <h2 className="font-display text-4xl font-black leading-headline">
          {headline}
        </h2>
        <p className="font-body text-body leading-reading mt-4 max-w-reading mx-auto opacity-90">
          {subtext}
        </p>

        {status === "idle" ? (
          <form
            onSubmit={onSubmit}
            className="mt-8 flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            noValidate
          >
            <label htmlFor="subscribe-email" className="sr-only">
              Email address
            </label>
            <input
              id="subscribe-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="flex-1 min-h-[44px] font-mono text-base bg-cream text-ink placeholder-ink/50 px-4 py-3 rounded-sharp border border-ink/20"
            />
            <button
              type="submit"
              className="min-h-[44px] bg-ink text-cream font-mono text-meta uppercase tracking-mono-wide px-8 py-3 rounded-sharp cursor-pointer hover:opacity-90 transition-opacity"
            >
              Subscribe
            </button>
          </form>
        ) : (
          <p
            role="status"
            className="mt-8 font-mono text-meta uppercase tracking-mono-wide"
          >
            Subscribed. Watch your inbox.
          </p>
        )}
      </div>
    </section>
  );
}
