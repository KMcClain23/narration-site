import "server-only";

/**
 * Minimal PayPal REST client — OAuth plus the Invoicing v2 calls this app makes.
 *
 * Invoicing rather than Orders: an Orders approval link is meant for a checkout
 * happening now and goes stale, while an invoice link stays payable for as long
 * as the invoice is open. An emailed invoice may sit for a fortnight before
 * anyone opens it, so a link that expires is worse than no link at all.
 */

const LIVE = "https://api-m.paypal.com";
const SANDBOX = "https://api-m.sandbox.paypal.com";

export function paypalBase(): string {
  return process.env.PAYPAL_ENV === "sandbox" ? SANDBOX : LIVE;
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/**
 * Tokens last hours; this caches one in module scope so a burst of calls in a
 * single request doesn't re-authenticate each time. Refreshed a minute early so
 * a token can't expire between being handed out and being used.
 */
let cached: { token: string; expiresAt: number } | null = null;

export async function paypalToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`,
  ).toString("base64");

  const res = await fetch(`${paypalBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`PayPal auth failed (${res.status}). Check the client id and secret.`);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(0, json.expires_in - 60) * 1000,
  };
  return cached.token;
}

type PayPalError = { message?: string; details?: { description?: string; issue?: string }[] };

/** Surfaces PayPal's own description, which is far more useful than the status. */
export function paypalErrorMessage(status: number, body: unknown): string {
  const e = body as PayPalError | null;
  const detail = e?.details?.[0];
  return detail?.description || detail?.issue || e?.message || `PayPal returned ${status}.`;
}

export async function paypalFetch(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const token = await paypalToken();
  const { json, ...rest } = init;

  const res = await fetch(`${paypalBase()}${path}`, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(rest.headers ?? {}),
    },
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
  });

  // A 204 carries no body, and .json() on an empty response throws.
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}
