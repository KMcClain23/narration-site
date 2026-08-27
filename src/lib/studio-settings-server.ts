import { supabaseAdmin } from "@/lib/supabase-admin";
import { settingsFromRows, SETTING_KEYS, type StudioSettings } from "@/lib/studio-settings";

/**
 * The one server-side loader for studio settings.
 *
 * A sibling file rather than an addition to `studio-settings.ts`, deliberately:
 * that module is imported by `useStudioSettings.ts` and `StudioSettingsForm.tsx`,
 * both client components, and importing `supabaseAdmin` there would pull the
 * service-role key into the browser bundle. The type, the keys and the parser stay
 * shared; only the fetch is server-only.
 *
 * It exists because W1 needs settings in three more server contexts and
 * `api/agenda/route.ts` already queried `site_settings` inline. A fourth copy of that
 * query is the disease this whole fix is about — the finished-hour divisor was
 * "written down twice and had already drifted once", and duplication is how it drifts.
 */
export async function getStudioSettings(): Promise<StudioSettings> {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(SETTING_KEYS));
  return settingsFromRows(data ?? []);
}
