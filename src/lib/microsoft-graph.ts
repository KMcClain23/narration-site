import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * The Microsoft 365 connection, shared by everything that reads the mailbox.
 *
 * Lived inside the email-scan route until the receipts scanner needed it too.
 * Two copies of a token refresh is one too many: the copy that is not being
 * looked at is the one that silently stops refreshing.
 */

export async function graphToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("admin_integrations")
    .select("access_token, refresh_token, expires_at")
    .eq("service", "microsoft")
    .single();

  if (!data?.access_token) return null;

  // Reused while more than five minutes remain, so a long scan cannot have its
  // token expire between the first message and the last.
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 5 * 60 * 1000) return data.access_token;

  if (!data.refresh_token) return null;

  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID ?? "common"}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
        client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
        refresh_token: data.refresh_token,
        grant_type: "refresh_token",
        scope: "Mail.Read offline_access",
      }),
    },
  );

  if (!res.ok) return null;

  const tokens = await res.json();
  await supabaseAdmin
    .from("admin_integrations")
    .update({
      access_token: tokens.access_token,
      // Microsoft does not always return a new refresh token; keeping the old
      // one is what stops a silent disconnection a fortnight later.
      refresh_token: tokens.refresh_token ?? data.refresh_token,
      expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    })
    .eq("service", "microsoft");

  return tokens.access_token as string;
}

export async function graphGet<T>(path: string, token: string): Promise<T | null> {
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export type MailFolder = { id: string; displayName: string; totalItemCount?: number };

/**
 * Find a folder by name, case-insensitively, anywhere in the tree.
 *
 * Graph only lists top-level folders by default, and a receipts folder is as
 * likely to be filed under Inbox as beside it. Searching one level down covers
 * both without walking the whole mailbox.
 */
export async function findMailFolder(name: string, token: string): Promise<MailFolder | null> {
  const wanted = name.trim().toLowerCase();

  const top = await graphGet<{ value: MailFolder[] }>("/me/mailFolders?$top=100", token);
  const match = top?.value?.find(f => f.displayName?.trim().toLowerCase() === wanted);
  if (match) return match;

  for (const folder of top?.value ?? []) {
    const kids = await graphGet<{ value: MailFolder[] }>(
      `/me/mailFolders/${folder.id}/childFolders?$top=100`,
      token,
    );
    const kid = kids?.value?.find(f => f.displayName?.trim().toLowerCase() === wanted);
    if (kid) return kid;
  }

  return null;
}
