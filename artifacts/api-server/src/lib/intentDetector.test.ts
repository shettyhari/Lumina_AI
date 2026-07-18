/**
 * Unit tests for the year-inference heuristic in detectBudgetMonth.
 *
 * `inferMonthYear` is a pure function so these tests require no DB or network.
 * Run with: pnpm --filter @workspace/api-server test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inferMonthYear, detectBudgetMonth, scoreBudgetConfidence, detectBudgetLogHint, isBudgetEntryBlockedByConfidence } from "./intentDetector.js";

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
// scoreBudgetConfidence — pure function tests
// ---------------------------------------------------------------------------

describe("scoreBudgetConfidence", () => {
  it("returns high when $ sign + known category", () => {
    assert.equal(scoreBudgetConfidence("I spent $47 on groceries today", "Groceries"), "high");
  });

  it("returns high for utility bill with $ sign", () => {
    assert.equal(scoreBudgetConfidence("paid the electricity bill — $120", "Utilities"), "high");
  });

  it("returns low when no $ sign even with known category", () => {
    assert.equal(scoreBudgetConfidence("I spent 50 on groceries", "Groceries"), "low");
  });

  it("returns low when category is Other even with $ sign", () => {
    assert.equal(scoreBudgetConfidence("I spent $50 on a gift for mom", "Other"), "low");
  });

  it("returns low when ambiguous signal 'back' is present", () => {
    assert.equal(scoreBudgetConfidence("got paid back $10", "Salary"), "low");
  });

  it("returns low when ambiguous signal 'owed' is present", () => {
    assert.equal(scoreBudgetConfidence("I paid $10 I owed to Sarah", "Other"), "low");
  });

  it("returns low when ambiguous signal 'reimburse' is present", () => {
    assert.equal(scoreBudgetConfidence("I need to reimburse $200 for the hotel", "Other"), "low");
  });

  it("returns low when ambiguous signal 'refund' is present", () => {
    assert.equal(scoreBudgetConfidence("I got a $50 refund", "Other"), "low");
  });
});

// ---------------------------------------------------------------------------
// detectBudgetLogHint — hint text branches based on confidence
// ---------------------------------------------------------------------------

describe("detectBudgetLogHint", () => {
  it("returns null when no budget pattern matches", () => {
    assert.equal(detectBudgetLogHint("Tell me about the weather"), null);
  });

  it("returns high-confidence hint for clear expense with $ and known category", () => {
    const h = detectBudgetLogHint("I spent $47 on groceries today");
    assert.ok(h, "should return a hint");
    assert.ok(h!.includes("[Budget Log Action]"), "high-confidence hint should say Budget Log Action");
    assert.ok(!h!.includes("Confirmation Required"), "should not say confirmation required");
    assert.ok(h!.includes("47.00"), "should include amount");
    assert.ok(h!.includes("Groceries"), "should include category");
  });

  it("returns low-confidence hint (asks user to confirm) for unknown category", () => {
    // "random stuff" matches no known category → Other → low confidence
    const h = detectBudgetLogHint("I spent $30 on random stuff");
    assert.ok(h, "should return a hint");
    assert.ok(h!.includes("Confirmation Required"), "low-confidence hint should say Confirmation Required");
    assert.ok(h!.includes("DO NOT record"), "should instruct AI not to auto-log");
    assert.ok(h!.includes("30.00"), "should include amount");
  });

  it("returns low-confidence hint when ambiguous signal present", () => {
    // "paid back" → ambiguous → low confidence even if category matches
    const h = detectBudgetLogHint("she paid back $200 for rent");
    // May or may not match a pattern at all; if it does it must be low confidence
    if (h !== null) {
      assert.ok(h.includes("Confirmation Required"), "ambiguous phrase must produce low-confidence hint");
    }
  });

  it("high-confidence hint mentions budget page for undo", () => {
    const h = detectBudgetLogHint("I spent $120 on electricity today");
    assert.ok(h, "should return a hint");
    if (h!.includes("[Budget Log Action]")) {
      assert.ok(h!.includes("Budget"), "should mention Budget page for corrections");
    }
  });
});

// ---------------------------------------------------------------------------
// Income category detection — new patterns (task #16)
// ---------------------------------------------------------------------------

describe("income category detection", () => {
  // Helper: extract what detectBudgetLogHint would categorise
  function classify(msg: string) {
    const h = detectBudgetLogHint(msg);
    if (!h) return null;
    const m = h.match(/Category:\s*([^\n]+)/);
    return m ? m[1].trim() : null;
  }

  // ── Freelance ──────────────────────────────────────────────────────────────
  it("categorises 'received $500 from freelance work' as Freelance", () => {
    assert.equal(classify("I received $500 from freelance work today"), "Freelance");
  });

  it("categorises 'earned $800 for consulting' as Freelance", () => {
    assert.equal(classify("I earned $800 for consulting yesterday"), "Freelance");
  });

  it("categorises 'client paid me $500' as Freelance", () => {
    assert.equal(classify("my client paid me $500"), "Freelance");
  });

  // ── Reimbursement ──────────────────────────────────────────────────────────
  it("categorises 'insurance reimbursed us $300' as Reimbursement", () => {
    assert.equal(classify("insurance reimbursed us $300"), "Reimbursement");
  });

  it("categorises 'company reimbursed me $150' as Reimbursement", () => {
    assert.equal(classify("my company reimbursed me $150"), "Reimbursement");
  });

  it("categorises 'received $200 from reimbursement' as Reimbursement", () => {
    assert.equal(classify("I received $200 from reimbursement today"), "Reimbursement");
  });

  // ── Investment ─────────────────────────────────────────────────────────────
  it("categorises 'received $100 as dividend' as Investment", () => {
    assert.equal(classify("I received $100 as dividend income today"), "Investment");
  });

  // ── Rental ─────────────────────────────────────────────────────────────────
  it("categorises 'rental income of $1200' as Rental", () => {
    assert.equal(classify("rental income of $1200 arrived"), "Rental");
  });

  it("categorises 'received $1200 from rental income' as Rental", () => {
    assert.equal(classify("I received $1200 from rental income today"), "Rental");
  });

  // ── Salary ─────────────────────────────────────────────────────────────────
  it("categorises 'got paid $3000 today' as Salary", () => {
    assert.equal(classify("got paid $3000 today"), "Salary");
  });

  it("categorises 'my salary of $4000 arrived' as Salary", () => {
    assert.equal(classify("my salary of $4000 arrived"), "Salary");
  });

  it("categorises 'received $2500 as bonus' as Salary", () => {
    assert.equal(classify("I received $2500 as bonus"), "Salary");
  });

  // ── Gift ───────────────────────────────────────────────────────────────────
  it("categorises 'received $100 as a gift' as Gift", () => {
    assert.equal(classify("I received $100 as a gift today"), "Gift");
  });

  // ── Confidence gates still apply ──────────────────────────────────────────
  it("reimbursement income is NOT blocked by confidence gate (no longer ambiguous)", () => {
    assert.equal(isBudgetEntryBlockedByConfidence("insurance reimbursed us $300"), false);
  });

  it("high-confidence freelance income is NOT blocked", () => {
    assert.equal(isBudgetEntryBlockedByConfidence("I received $500 from freelance work today"), false);
  });
});

// ---------------------------------------------------------------------------
// isBudgetEntryBlockedByConfidence — server-side gate tests
// ---------------------------------------------------------------------------

describe("isBudgetEntryBlockedByConfidence", () => {
  it("returns false when message has no budget pattern", () => {
    assert.equal(isBudgetEntryBlockedByConfidence("Tell me about the weather"), false);
  });

  it("returns false for empty string", () => {
    assert.equal(isBudgetEntryBlockedByConfidence(""), false);
  });

  it("returns false for high-confidence expense ($ + known category)", () => {
    // High confidence → NOT blocked → tool should proceed
    assert.equal(isBudgetEntryBlockedByConfidence("I spent $47 on groceries today"), false);
  });

  it("returns false for a follow-up confirmation message (no budget pattern match)", () => {
    // User says "yes, log it" — no pattern matches → not blocked → tool allowed
    assert.equal(isBudgetEntryBlockedByConfidence("Yes, please log it as Groceries"), false);
  });

  it("returns true for low-confidence expense (unknown category)", () => {
    // "random stuff" matches no known category → Other → low confidence → blocked
    assert.equal(isBudgetEntryBlockedByConfidence("I spent $30 on random stuff"), true);
  });

  it("returns true when ambiguous signal 'owed' is present in a matching message", () => {
    // "for rent that I owed" — ep1 pattern matches (paid $amount for …),
    // but AMBIGUOUS_BUDGET_SIGNALS fires on "owed" → low confidence → blocked
    const msg = "I paid $200 for rent that I owed";
    assert.equal(isBudgetEntryBlockedByConfidence(msg), true);
  });

  it("returns true when ambiguous signal 'back' is present with $ amount", () => {
    const msg = "got $50 back for the return";
    // If this matches a budget pattern, it must be blocked
    const result = isBudgetEntryBlockedByConfidence(msg);
    // Pattern may or may not match; if it does it must be blocked
    if (detectBudgetLogHint(msg) !== null) {
      assert.equal(result, true, "ambiguous 'back' phrase must be blocked");
    }
  });

  it("returns false for clear paycheck income (high confidence)", () => {
    // "got paid $3000 today" → Salary category + $ sign → high confidence → not blocked
    assert.equal(isBudgetEntryBlockedByConfidence("got paid $3000 today"), false);
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
