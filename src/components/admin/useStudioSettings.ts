"use client";

import { useEffect, useSyncExternalStore } from "react";
import type {
  SettingIssue,
  StudioSettingField,
  StudioSettings,
} from "@/lib/studio-settings";

/**
 * Three states, because there are three situations.
 *
 * There used to be one. The hook seeded itself with `DEFAULT_STUDIO_SETTINGS`,
 * swallowed every failure with `.catch(() => {})`, and returned a plain
 * `StudioSettings` — so "still fetching", "loaded" and "the request failed and
 * always will" were the same value to every caller. A component could not have
 * told them apart if it had wanted to.
 *
 * Note what this union removes rather than what it adds: there is no longer a
 * shape in the type system for defaults wearing the costume of a load result.
 * That is what made this hook invisible to Stage 7's first pass — widening
 * `StudioSettings` to nullable enumerates every CONSUMER of a rate and no
 * PRODUCER of one, and this hook is a producer. `DEFAULT_STUDIO_SETTINGS` is
 * not assignable to a `StudioSettingsState`, so it cannot come back here.
 */
export type StudioSettingsState =
  | { status: "loading" }
  | {
      status: "loaded";
      settings: StudioSettings;
      issues: Partial<Record<StudioSettingField, SettingIssue>>;
    }
  | { status: "failed"; reason: string; httpStatus: number | null };

const NO_RATES: StudioSettings = {
  wordsPerNarrationHour: null,
  wordsPerFinishedHour: null,
  dailyCapacityHours: null,
  maxBooksPerDay: null,
  heavyDayHours: null,
};

/**
 * The rates a figure may be computed from — null while loading and after a
 * failure, because a rate that has not arrived is not a rate either.
 *
 * For a FIGURE, loading and failed are correctly identical: both render absent.
 * The two are told apart by the state itself, which is what a surface consults
 * when it has something to say — "Loading…" against "could not be read". A site
 * that only draws a number does not need to know which, and making it narrow the
 * union to find that out would be ceremony rather than safety.
 */
export function studioRates(state: StudioSettingsState): StudioSettings {
  return state.status === "loaded" ? state.settings : NO_RATES;
}

/**
 * Why a figure is missing or an action is unavailable, in one sentence.
 *
 * Null when the settings loaded, so a caller that gets a string knows the reason
 * is real. The two non-null answers are deliberately different sentences: a
 * disabled Invoice button that says "still loading" and one that says "could not
 * be read" ask the user to do different things.
 */
export function studioUnavailableReason(state: StudioSettingsState): string | null {
  switch (state.status) {
    case "loading":
      return "Still loading the studio settings.";
    case "failed":
      // The state's OWN reason, not a fixed sentence. A 401 and a 500 are not
      // the same situation and must not read as the same situation — see
      // describeSettingsFailure.
      return state.reason;
    case "loaded":
      return null;
  }
}

/** Carries the HTTP status out of the fetch so the catch can act on it. */
class SettingsRequestError extends Error {
  constructor(readonly httpStatus: number) {
    super(`The studio settings request failed (${httpStatus}).`);
  }
}

/**
 * What a failed settings read means, and what to do about it.
 *
 * This existed as ONE sentence for every non-2xx: "The studio settings request
 * failed (N)". Three unrelated situations rendered identically, and only one of
 * them was about settings at all — a signed-out session produced "settings
 * unreadable" on /payments, which sends someone to the Settings page to look at
 * a value that is perfectly fine. That is the two-states-rendering-identically
 * failure, inside the code written to keep states apart.
 *
 * Each branch says what to DO, matching how the rest of Stage 7's surfaces are
 * worded. The status is kept on the state as well, so a caller that needs to
 * branch on it does not have to parse this sentence back apart.
 */
export function describeSettingsFailure(httpStatus: number | null): string {
  if (httpStatus === null) return "Could not reach the server. Check your connection and try again.";
  if (httpStatus === 401) return "You are signed out. Sign in again to see these figures.";
  if (httpStatus === 403) return "This account does not have permission to read the studio settings.";
  if (httpStatus >= 500) return "The server could not read the studio settings. Try again shortly.";
  return `The studio settings request failed (${httpStatus}).`;
}

/**
 * The studio numbers, for client components that do arithmetic with them.
 *
 * Starts at `loading` rather than at the defaults, so nothing renders a
 * default-derived figure that then silently changes. The cost is a beat of
 * blankness on first paint; the alternative is a money figure that is briefly
 * wrong on precisely the day the stored value differs from the default, which
 * is the day this whole stage exists for.
 */
/**
 * ONE fetch, ONE loading state, shared by every caller.
 *
 * Eight components call this hook. Each used to run its own useEffect and its
 * own fetch, which meant eight requests for the same small JSON and — the part
 * that actually mattered — EIGHT INDEPENDENT LOADING WINDOWS.
 *
 * That is the shape behind the /payments outage of 26 August. A component read
 * a rate during its own loading window, the value was captured by a useMemo
 * whose dependency array omitted it, the memo froze at the loading answer, and
 * every project rendered "Cannot be worked out — settings unreadable" for three
 * days while the settings were perfectly readable. Collapsing eight windows
 * into one removes seven chances for the next consumer to do the same.
 *
 * A MODULE STORE RATHER THAN A CONTEXT PROVIDER, deliberately. A provider has
 * to be mounted above every consumer, and a consumer rendered outside it fails
 * silently or throws — so the guarantee would depend on eight call sites all
 * sitting under one tree. They do not: /board is a client page, so the admin
 * layout it shares with the others is bundled client-side there and cannot be
 * the server boundary. With a store, every caller reads the same state by
 * construction and there is nothing to mount incorrectly.
 *
 * Not fetched server-side for the same reason, plus one more: the only server
 * boundary above all of these is the ROOT layout, which wraps the public site
 * too. getStudioSettings() reads with the service-role client, and putting its
 * answer in the root layout would serialise studio rates into every public
 * page's HTML.
 */

/** The one answer, shared. A stable reference, so useSyncExternalStore can compare it. */
let snapshot: StudioSettingsState = { status: "loading" };

/** The one request. Null until something asks; never re-entered while pending. */
let inFlight: Promise<void> | null = null;

const listeners = new Set<() => void>();

function publish(next: StudioSettingsState) {
  snapshot = next;
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

const getSnapshot = () => snapshot;

/**
 * SSR has no window and must not start a fetch. It returns the loading state,
 * which every surface already renders correctly — that property is what
 * check-first-render exists to hold.
 */
const LOADING: StudioSettingsState = { status: "loading" };
const getServerSnapshot = () => LOADING;

/**
 * One retry, with a short backoff, before the store gives up.
 *
 * Consolidating eight fetches into one also consolidates the FAILURE. A single
 * 500 now takes all eight consumers at once, where before it might have taken
 * one — so a transient failure that used to be survivable is worth one more
 * attempt before the page says it could not read the settings.
 *
 * Not more than one and not indefinitely: the failed state is honest and
 * actionable, and a store that retries forever turns a readable error into a
 * spinner that never resolves.
 */
const RETRY_LIMIT = 1;
const RETRY_DELAY_MS = 1200;

async function fetchSettingsOnce(): Promise<StudioSettingsState> {
  try {
    const r = await fetch("/api/studio-settings");
    if (!r.ok) throw new SettingsRequestError(r.status);
    const data = await r.json();
    const read = data?.settings;
    if (!read?.settings) throw new Error("The studio settings response had no settings.");
    return { status: "loaded", settings: read.settings, issues: read.issues ?? {} };
  } catch (e: unknown) {
    // Was `.catch(() => {})`, which kept the defaults on screen forever and
    // left no trace anywhere that the fetch had ever failed.
    //
    // A transport failure and a malformed body have no HTTP status, and are
    // deliberately not described as if they did.
    const httpStatus = e instanceof SettingsRequestError ? e.httpStatus : null;
    return { status: "failed", httpStatus, reason: describeSettingsFailure(httpStatus) };
  }
}

function loadOnce(): void {
  if (inFlight) return;
  inFlight = (async () => {
    for (let attempt = 0; ; attempt++) {
      const result = await fetchSettingsOnce();

      // A 401 is not transient: the session is gone, and retrying only delays
      // telling the person to sign in again.
      const signedOut = result.status === "failed" && result.httpStatus === 401;

      if (result.status === "loaded" || signedOut || attempt >= RETRY_LIMIT) {
        publish(result);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  })();
}

/**
 * The studio numbers, for client components that do arithmetic with them.
 *
 * Starts at `loading` rather than at the defaults, so nothing renders a
 * default-derived figure that then silently changes. The cost is a beat of
 * blankness on first paint; the alternative is a money figure that is briefly
 * wrong on precisely the day the stored value differs from the default, which
 * is the day this whole thing exists for.
 */
export function useStudioSettings(): StudioSettingsState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    loadOnce();
  }, []);
  return state;
}

/**
 * Drops the cached answer and the in-flight request.
 *
 * For tests and for a deliberate re-read after a settings SAVE — without it the
 * store would hand back the pre-save numbers for the life of the page, which is
 * the staleness a shared cache buys in exchange for the shared loading state.
 */
export function resetStudioSettingsCache(): void {
  inFlight = null;
  publish({ status: "loading" });
  // RE-READS immediately rather than waiting for a consumer to mount. Nothing
  // necessarily remounts after a save — the settings form stays on screen — so
  // a reset that only cleared the cache would leave every consumer in `loading`
  // until the next navigation, which is a worse outcome than the stale numbers
  // it was meant to fix.
  loadOnce();
}
