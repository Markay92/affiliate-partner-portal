import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** True when the user has asked the OS to minimize non-essential motion. */
export function prefersReducedMotion() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Normalize a card name for display: decode HTML entities and convert the
 * plain-text trademark markers — (TM)→™, (R)→®, (SM)→℠, (C)→© — to symbols.
 * Used everywhere card names are shown (member + manager).
 */
export function prettyCardName(str: string): string {
  return (str || "")
    .replace(/&amp;/g, "&")
    .replace(/&reg;/g, "®")
    .replace(/&trade;/g, "™")
    .replace(/&copy;/g, "©")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\(TM\)/g, "™")
    .replace(/\(R\)/g, "®")
    .replace(/\(SM\)/g, "℠")
    .replace(/\(C\)/g, "©");
}
