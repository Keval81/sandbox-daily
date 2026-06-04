import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "Admin - Sandbox Daily",
  description: "Internal Sandbox Daily operational dashboards.",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div data-admin-shell className="min-h-screen bg-[#07090f] text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/95 px-6 py-4">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <Link
            href="/admin/workflow"
            className="font-mono text-xs uppercase tracking-[0.18em] text-slate-200"
          >
            Sandbox Daily Ops
          </Link>
          <nav className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-slate-400">
            <Link
              className="rounded-full bg-slate-100 px-3 py-2 text-slate-950"
              href="/admin/workflow"
            >
              Workflow
            </Link>
            <Link
              className="rounded-full bg-slate-100 px-3 py-2 text-slate-950"
              href="/admin/radar"
            >
              Radar
            </Link>
            <span className="rounded-full border border-slate-700 px-3 py-2">
              Engagement Later
            </span>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
