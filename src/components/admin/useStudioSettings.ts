"use client";

import { useEffect, useState } from "react";
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
  | { status: "failed"; reason: string };

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
      return "The studio settings could not be read.";
    case "loaded":
      return null;
  }
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
export function useStudioSettings(): StudioSettingsState {
  const [state, setState] = useState<StudioSettingsState>({ status: "loading" });

  useEffect(() => {
    let live = true;
    fetch("/api/studio-settings")
      .then(async r => {
        if (!r.ok) throw new Error(`The studio settings request failed (${r.status}).`);
        return r.json();
      })
      .then(data => {
        if (!live) return;
        const read = data?.settings;
        if (!read?.settings) throw new Error("The studio settings response had no settings.");
        setState({ status: "loaded", settings: read.settings, issues: read.issues ?? {} });
      })
      .catch((e: unknown) => {
        // Was `.catch(() => {})`, which kept the defaults on screen forever and
        // left no trace anywhere that the fetch had ever failed.
        if (!live) return;
        setState({
          status: "failed",
          reason: e instanceof Error ? e.message : "The studio settings could not be read.",
        });
      });
    return () => {
      live = false;
    };
  }, []);

  return state;
}
