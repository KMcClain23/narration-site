import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  settingsFromRows,
  studioSettingsUnread,
  SETTING_KEYS,
  type StudioSettingsRead,
} from "@/lib/studio-settings";

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
 *
 * `error` is destructured now, and that is the whole of layer 1.
 *
 * It used to be dropped on the floor: a failed read produced `data === null`,
 * `settingsFromRows([])` filled every field from `DEFAULT_STUDIO_SETTINGS`, and the
 * caller received a complete, confident, entirely invented set of numbers. Four of
 * the five defaults equal the stored values, so the failure was invisible on exactly
 * the surfaces where it mattered — including the one that settles money.
 */
export async function getStudioSettings(): Promise<StudioSettingsRead> {
  const { data, error } = await supabaseAdmin
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(SETTING_KEYS));

  if (error) return studioSettingsUnread(error.message);
  // Layer 2: `data` being null with no error should not happen, but "should not
  // happen" is not a reason to answer it with five numbers nobody chose.
  if (!data) return studioSettingsUnread("The studio settings read returned nothing.");

  return settingsFromRows(data);
}
