/**
 * Unit tests for the year-inference heuristic in detectBudgetMonth.
 *
 * `inferMonthYear` is a pure function so these tests require no DB or network.
 * Run with: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferMonthYear, detectBudgetMonth } from "./intentDetector.js";

// ---------------------------------------------------------------------------
// inferMonthYear — pure function tests
// ---------------------------------------------------------------------------

describe("inferMonthYear", () => {
  // Assume today is July (month 7) 2025 for all tests
  const CY = 2025;
  const CM = 7;

  it("uses an explicit year verbatim — past", () => {
    const r = inferMonthYear(3, CY, CM, 2022);
    assert.equal(r.year, 2022);
    assert.equal(r.assumedPriorYear, false);
  });

  it("uses an explicit year verbatim — future", () => {
    const r = inferMonthYear(10, CY, CM, 2026);
    assert.equal(r.year, 2026);
    assert.equal(r.assumedPriorYear, false);
  });

  it("current month → current year, no assumption", () => {
    const r = inferMonthYear(CM, CY, CM);
    assert.equal(r.year, CY);
    assert.equal(r.assumedPriorYear, false);
  });

  it("past month (same year) → current year, no assumption", () => {
    const r = inferMonthYear(3, CY, CM); // March, current month = July
    assert.equal(r.year, CY);
    assert.equal(r.assumedPriorYear, false);
  });

  it("future month WITHOUT future-intent → prior year + flag", () => {
    const r = inferMonthYear(10, CY, CM); // October, no 'next'/'will'/etc.
    assert.equal(r.year, CY - 1);
    assert.equal(r.assumedPriorYear, true);
  });

  it("future month WITH future-intent → current year, no flag", () => {
    const r = inferMonthYear(10, CY, CM, undefined, true);
    assert.equal(r.year, CY);
    assert.equal(r.assumedPriorYear, false);
  });

  it("December future month (boundary) without intent → prior year", () => {
    const r = inferMonthYear(12, CY, CM);
    assert.equal(r.year, CY - 1);
    assert.equal(r.assumedPriorYear, true);
  });

  it("January past (month < current) → current year, no assumption", () => {
    const r = inferMonthYear(1, CY, CM); // January, current month = July
    assert.equal(r.year, CY);
    assert.equal(r.assumedPriorYear, false);
  });
});

// ---------------------------------------------------------------------------
// detectBudgetMonth — integration smoke-tests (no DB calls needed)
// ---------------------------------------------------------------------------

describe("detectBudgetMonth — future-month phrases", () => {
  // We can't control Date() in these tests, so we just verify the shape and
  // that future-signalling phrases don't roll back to the prior year when the
  // named month is in the future relative to today's actual date.

  it("returns null for 'this month'", () => {
    assert.equal(detectBudgetMonth("What's our budget this month?"), null);
  });

  it("returns single kind for 'last month'", () => {
    const r = detectBudgetMonth("How much did we spend last month?");
    assert.ok(r);
    assert.equal(r!.kind, "single");
  });

  it("explicit year is respected — past", () => {
    const r = detectBudgetMonth("Show me January 2023 spending");
    assert.ok(r);
    assert.equal(r!.kind, "single");
    if (r!.kind === "single") {
      assert.equal(r.year, 2023);
      assert.equal(r.month, 1);
      assert.equal(r.assumedPriorYear, false);
    }
  });

  it("explicit future year is respected — future", () => {
    const r = detectBudgetMonth("What will we spend in August 2030?");
    assert.ok(r);
    assert.equal(r!.kind, "single");
    if (r!.kind === "single") {
      assert.equal(r.year, 2030);
      assert.equal(r.month, 8);
      assert.equal(r.assumedPriorYear, false);
    }
  });

  it("future-signal word prevents prior-year rollback for a future month", () => {
    // Pick a month that is always in the future from a July baseline — December
    // Since we can't freeze Date() we check: if today's month < 12, December
    // is in the future, so "next December" must NOT roll back.
    const now = new Date();
    if (now.getMonth() + 1 < 12) {
      const r = detectBudgetMonth("What will we spend in December?");
      assert.ok(r);
      if (r!.kind === "single") {
        assert.equal(r.year, now.getFullYear(), "future month with 'will' should stay in current year");
        assert.equal(r.assumedPriorYear, false);
      }
    }
  });

  it("ambiguous future month without future signal sets assumedPriorYear", () => {
    const now = new Date();
    if (now.getMonth() + 1 < 12) {
      const r = detectBudgetMonth("Show me December spending");
      assert.ok(r);
      if (r!.kind === "single") {
        assert.equal(r.year, now.getFullYear() - 1, "ambiguous future month rolls back to prior year");
        assert.equal(r.assumedPriorYear, true);
      }
    }
  });

  it("quarter returns range kind", () => {
    const r = detectBudgetMonth("How did we do in Q2?");
    assert.ok(r);
    assert.equal(r!.kind, "range");
  });
});
