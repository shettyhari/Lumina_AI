/**
 * Unit tests for the pure decision logic behind Lina's consequential agent
 * tools — the confirm-before-acting gate shared by every delete/large-spend
 * tool, and the date math behind recurring calendar events and meal-plan
 * lookups. No DB, no network: these are the parts of the delete/spend
 * surface that can be verified without a test database.
 *
 * Run with: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { needsConfirmation, addRecurrenceStep, RECURRENCE_HORIZON, mealPlanAbsoluteDate } from "./agentTools.js";

// ---------------------------------------------------------------------------
// needsConfirmation — the shared gate behind delete_reminder, delete_chore,
// delete_calendar_event, and the $500+ budget-entry threshold
// ---------------------------------------------------------------------------

describe("needsConfirmation", () => {
  it("requires confirmation when there's no original message at all", () => {
    assert.equal(needsConfirmation(undefined), true);
  });

  it("requires confirmation for an empty message", () => {
    assert.equal(needsConfirmation(""), true);
  });

  it("requires confirmation for a plain request with no confirmation language", () => {
    assert.equal(needsConfirmation("delete my dentist appointment"), true);
  });

  it("does NOT require confirmation once the user says yes", () => {
    assert.equal(needsConfirmation("yes"), false);
  });

  it("does NOT require confirmation for 'delete it'", () => {
    assert.equal(needsConfirmation("delete it"), false);
  });

  it("does NOT require confirmation for 'go ahead'", () => {
    assert.equal(needsConfirmation("go ahead"), false);
  });

  it("does NOT require confirmation for a contraction like \"that's right\"", () => {
    assert.equal(needsConfirmation("yep that's right"), false);
  });

  it("is case-insensitive", () => {
    assert.equal(needsConfirmation("YES, confirm it"), false);
  });

  it("does not false-positive on 'yesterday' (word-boundary check)", () => {
    // "yesterday" contains "yes" but is not the user saying yes — a naive
    // substring match here would wrongly bypass the gate.
    assert.equal(needsConfirmation("I meant the one from yesterday, not today"), true);
  });

  it("does not false-positive on 'correctly' matching 'correct'", () => {
    assert.equal(needsConfirmation("did I do that correctly"), true);
  });
});

// ---------------------------------------------------------------------------
// addRecurrenceStep / RECURRENCE_HORIZON — the bounded-occurrence generator
// behind add_calendar_event's repeat option
// ---------------------------------------------------------------------------

describe("addRecurrenceStep", () => {
  // addRecurrenceStep does its arithmetic with local-time getters/setters
  // (setDate/setMonth), same reasoning as mealPlanAbsoluteDate below —
  // asserting via local getters, not toISOString(), keeps this correct
  // regardless of which timezone runs it.
  it("daily adds exactly one day", () => {
    const next = addRecurrenceStep(new Date(2026, 2, 10, 9, 0, 0), "daily"); // Mar 10 2026, local
    assert.equal(next.getFullYear(), 2026);
    assert.equal(next.getMonth(), 2);
    assert.equal(next.getDate(), 11);
    assert.equal(next.getHours(), 9);
  });

  it("weekly adds exactly seven days", () => {
    const next = addRecurrenceStep(new Date(2026, 2, 10, 9, 0, 0), "weekly");
    assert.equal(next.getMonth(), 2);
    assert.equal(next.getDate(), 17);
  });

  it("monthly advances the month, same day-of-month in the common case", () => {
    const next = addRecurrenceStep(new Date(2026, 2, 10, 9, 0, 0), "monthly");
    assert.equal(next.getMonth(), 3); // April (0-indexed)
    assert.equal(next.getDate(), 10);
  });

  it("monthly on the 31st rolls into the following month when the next month is shorter (JS Date behavior, not a bug fix — documented so a future refactor doesn't silently change it)", () => {
    // Jan 31 + 1 month: February doesn't have 31 days, so JS Date rolls
    // this over to March 2nd/3rd rather than clamping to Feb 28. Anyone
    // scheduling a monthly recurring event on the 29th-31st will see this.
    const next = addRecurrenceStep(new Date(2026, 0, 31, 9, 0, 0), "monthly");
    assert.notEqual(next.getMonth(), 1, "does not land in February — rolls into March instead of clamping");
  });

  it("horizon counts match what the tool description promises", () => {
    assert.equal(RECURRENCE_HORIZON.daily.count, 30);
    assert.equal(RECURRENCE_HORIZON.weekly.count, 12);
    assert.equal(RECURRENCE_HORIZON.monthly.count, 6);
  });
});

// ---------------------------------------------------------------------------
// mealPlanAbsoluteDate — converts (weekStart, dayOfWeek) back to a real date
// ---------------------------------------------------------------------------

// mealPlanAbsoluteDate parses weekStart and does its date-math in *local*
// time (new Date("YYYY-MM-DDT00:00:00"), not a "Z"-suffixed UTC instant),
// matching how the rest of the app displays these dates via
// toLocaleDateString(). Asserting via local getters here — not
// toISOString(), which would convert to UTC and read back the wrong
// calendar day in any timezone east of UTC.
function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("mealPlanAbsoluteDate", () => {
  it("dayOfWeek 0 returns the week's Monday itself", () => {
    const d = mealPlanAbsoluteDate("2026-03-09", 0); // a Monday
    assert.equal(localYmd(d), "2026-03-09");
  });

  it("dayOfWeek 6 returns the following Sunday", () => {
    const d = mealPlanAbsoluteDate("2026-03-09", 6);
    assert.equal(localYmd(d), "2026-03-15");
  });
});
