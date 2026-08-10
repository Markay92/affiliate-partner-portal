// Abuse & content-scraping protection for the affiliate portal API.
//
// This module provides a lightweight, KV-backed defense layer against
// systematic/automated abuse of the public API surface:
//
//   1. Per-IP, per-route-class rate limiting (fixed-window counters kept in the
//      existing kv_store table). Stops high-volume scraping of data endpoints
//      and brute-force / credential-stuffing / account-enumeration against the
//      auth endpoints.
//   2. Bad / bot User-Agent filtering on content endpoints, to turn away the
//      lazy scrapers and headless crawlers that don't bother to disguise
//      themselves.
//
// Design notes:
//   * Fixed-window counters are keyed only by (class, ip) — the window is
//     encoded inside the stored value and reset in place — so the number of
//     rows stays bounded by (distinct IPs x route classes) rather than growing
//     every window.
//   * The limiter FAILS OPEN: if the KV store errors or is slow, requests are
//     allowed through. Availability of the real site is never sacrificed for
//     rate limiting.
//   * Counters are best-effort. Concurrent requests can race the
//     read-modify-write and slightly undercount; that is an acceptable
//     trade-off for abuse mitigation (this is not a billing counter).

import * as kv from "./kv_store.tsx";

export interface RateLimitRule {
  /** Short identifier used in the KV key and logs. */
  readonly class: string;
  /** Max requests allowed per window, per client IP. */
  readonly limit: number;
  /** Window length in seconds. */
  readonly windowSec: number;
}

// Route classes and their limits. Tighter on anything that can be used to
// brute-force credentials or enumerate accounts; looser (but still capped) on
// authenticated data endpoints so a copied token can't be used to vacuum the
// API. All limits are per client IP.
export const RULES: Record<string, RateLimitRule> = {
  // Login / signup / password reset — brute force & enumeration targets.
  auth: { class: "auth", limit: 12, windowSec: 300 },
  // Manager login — protects the admin surface (all-affiliate data) from
  // password guessing.
  managerAuth: { class: "mgr-auth", limit: 8, windowSec: 300 },
  // Public content (card catalog etc.) — the classic scraping target.
  content: { class: "content", limit: 40, windowSec: 60 },
  // Authenticated affiliate data endpoints (links, tracking, activity...).
  data: { class: "data", limit: 120, windowSec: 60 },
  // Manager data endpoints (all-affiliate reads) — high value, kept modest.
  managerData: { class: "mgr-data", limit: 80, windowSec: 60 },
};

interface WindowState {
  count: number;
  // Epoch ms at which the current window ends and the counter resets.
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets (for Retry-After). */
  retryAfter: number;
}

/**
 * Best-effort client IP extraction. Supabase / Deno Deploy sits behind a proxy,
 * so the real client address is the first entry of X-Forwarded-For. Falls back
 * to other common proxy headers, then to a shared bucket.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown"
  );
}

/**
 * Fixed-window rate limit for (rule.class, ip). Returns whether the request is
 * allowed and how many requests remain in the current window. Fails open.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
  ip: string,
): Promise<RateLimitResult> {
  const key = `ratelimit:${rule.class}:${ip}`;
  const now = Date.now();
  const windowMs = rule.windowSec * 1000;

  try {
    const state = (await kv.get(key)) as WindowState | undefined;

    let next: WindowState;
    if (!state || typeof state.resetAt !== "number" || now >= state.resetAt) {
      // Start a fresh window.
      next = { count: 1, resetAt: now + windowMs };
    } else {
      next = { count: state.count + 1, resetAt: state.resetAt };
    }

    await kv.set(key, next);

    const remaining = Math.max(0, rule.limit - next.count);
    const retryAfter = Math.max(1, Math.ceil((next.resetAt - now) / 1000));

    return {
      allowed: next.count <= rule.limit,
      limit: rule.limit,
      remaining,
      retryAfter,
    };
  } catch (error) {
    // Fail open — never take the site down because the counter store hiccuped.
    console.log(`Rate limit check failed (allowing request): ${error?.message ?? error}`);
    return { allowed: true, limit: rule.limit, remaining: rule.limit, retryAfter: 0 };
  }
}

// User-Agent substrings that indicate an automated scraper / crawler / HTTP
// client rather than a real browser hitting the portal. Case-insensitive.
// Kept deliberately conservative so legitimate browsers are never blocked.
const BLOCKED_UA_PATTERNS: readonly string[] = [
  "curl/",
  "wget/",
  "python-requests",
  "python-urllib",
  "aiohttp",
  "httpx",
  "go-http-client",
  "okhttp",
  "java/",
  "libwww-perl",
  "scrapy",
  "node-fetch",
  "axios/",
  "httpclient",
  "phantomjs",
  "headlesschrome",
  "puppeteer",
  "playwright",
  "selenium",
  "bot",
  "crawler",
  "spider",
  "scraper",
];

/**
 * True when the User-Agent is missing or matches a known automation/scraper
 * signature. Applied only to content endpoints — not to auth or the app's own
 * authenticated data calls — so real users are never affected.
 */
export function isLikelyScraper(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length === 0) return true;
  const ua = userAgent.toLowerCase();
  return BLOCKED_UA_PATTERNS.some((p) => ua.includes(p));
}
