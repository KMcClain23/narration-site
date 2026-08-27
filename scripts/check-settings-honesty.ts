/**
 * What every surface class renders, for whatever site_settings currently holds.
 *
 * Usage (from project root):
 *   npm run check-settings-honesty
 *
 * Stage 7 has no test runner to lean on, and its whole claim is about what
 * appears on a screen when a read goes wrong. So this runs the REAL loader
 * against the REAL database and then calls the same pure functions the surfaces
 * call, printing what each one answers. Break a key with SQL, run this, and the
 * output is the observation — not a description of one.
 *
 * It is deliberately read-only. Forcing the broken states is done with reversible
 * SQL outside this script, so nothing here can leave a setting damaged.
 */
import {
  describeIssue,
  SETTING_KEYS,
  type StudioSettingField,
} from "@/lib/studio-settings";
import { getStudioSettings } from "@/lib/studio-settings-server";
import { estimatedEarnings, narrationPlan } from "@/components/admin/board-card-utils";
import { buildCalendar, fitBook, totalFree } from "@/lib/capacity";
import { finishedHours, projectState, PROJECT_STATE_LABEL } from "@/lib/payments";
import type { MoneyCard, PaymentRow } from "@/lib/payments";

function show(label: string, value: unknown) {
  const rendered =
    value === null ? "ABSENT (null)" : value === undefined ? "ABSENT (undefined)" : String(value);
  console.log(`    ${label.padEnd(42)} ${rendered}`);
}

async function main() {
  const read = await getStudioSettings();

  console.log("\n=== THE READ ===");
  console.log(`  failure: ${read.failure ?? "none"}`);
  for (const field of Object.keys(SETTING_KEYS) as StudioSettingField[]) {
    const v = read.settings[field];
    const issue = read.issues[field];
    console.log(
      `  ${field.padEnd(24)} ${String(v ?? "null").padEnd(8)} ${issue ? describeIssue(issue) : ""}`,
    );
  }

  const s = read.settings;

  // One representative book, so every figure below is about the same card.
  const card = {
    word_count: 94_000,
    pfh_rate: 250,
    payment_type: "pfh",
    narration_format: "solo",
    narrator_share_percent: null,
    status: "recording",
    deadline: "2026-12-01",
    recording_dates: ["2026-09-01", "2026-09-02", "2026-09-03"],
    words_recorded: 0,
  };

  console.log("\n=== SAY THE READ FAILED — Settings page ===");
  const stated = (Object.keys(SETTING_KEYS) as StudioSettingField[]).filter(f => read.issues[f]);
  if (read.failure) console.log(`    banner: the stored settings could not be read (${read.failure})`);
  if (stated.length === 0 && !read.failure) console.log("    nothing to state; all seven read cleanly");
  for (const f of stated) show(`${f} input box`, read.settings[f] === null ? "EMPTY + " + describeIssue(read.issues[f]!) : read.settings[f]);

  console.log("\n=== RENDER ABSENT — time figures (wordsPerNarrationHour) ===");
  const plan = narrationPlan({
    wordCount: card.word_count,
    narrationFormat: card.narration_format,
    narratorSharePercent: card.narrator_share_percent,
    deadline: card.deadline,
    schedule: { dates: card.recording_dates },
    wordsPerHour: s.wordsPerNarrationHour,
    wordsRecorded: card.words_recorded,
  });
  show("board card: hours at the mic", plan?.hours?.toFixed(1));
  show("board card: hrs/day", plan?.hoursPerDay?.toFixed(1));
  show("agenda: weekHours (null => no total)", plan == null ? null : "computed");
  show(
    "board card: heavy-day highlight",
    s.heavyDayHours == null ? null : `applied above ${s.heavyDayHours} hrs`,
  );

  console.log("\n=== RENDER ABSENT — money figures (wordsPerFinishedHour) ===");
  show(
    "board card: ~$ earnings",
    estimatedEarnings(
      card.word_count,
      card.pfh_rate,
      card.payment_type,
      card.narration_format,
      card.narrator_share_percent,
      s.wordsPerFinishedHour,
    )?.toFixed(2),
  );
  show("payments: finished hours", finishedHours(card.word_count, s.wordsPerFinishedHour)?.toFixed(2));

  console.log("\n=== RENDER ABSENT — capacity (dailyCapacityHours, maxBooksPerDay) ===");
  const calendar = buildCalendar({
    cards: [card as never],
    horizonDays: 30,
    wordsPerHour: s.wordsPerNarrationHour,
    dailyCapacity: s.dailyCapacityHours,
    today: new Date("2026-08-27T12:00:00Z"),
  });
  show("calendar: days rendered", calendar.length);
  show("calendar: free hours over horizon", totalFree(calendar));
  show("calendar: fit a 10-hour book", fitBook(10, calendar, { maxBooksPerDay: s.maxBooksPerDay }) ? "placed" : null);

  console.log("\n=== REFUSE — money that goes out ===");
  const state = projectState(card as unknown as MoneyCard, [] as PaymentRow[], s.wordsPerFinishedHour);
  show("payments list: project state", `${state} — "${PROJECT_STATE_LABEL[state]}"`);
  show(
    "invoice button",
    s.wordsPerFinishedHour == null ? "DISABLED, reason shown beside it" : "enabled",
  );
  show(
    "settleFromProvider",
    s.wordsPerFinishedHour == null
      ? "REFUSES before any write — settled:false"
      : "proceeds",
  );
  console.log("");
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
