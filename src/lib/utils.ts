import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Standard shadcn-style cn(): clsx for conditional joining + twMerge so later
// Tailwind classes reliably win over earlier ones (lets className overrides
// override component defaults without surprises).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
