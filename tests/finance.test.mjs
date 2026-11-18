import assert from "node:assert/strict";
import test from "node:test";
import {
  demoData,
  totals,
  series,
  shiftMonth,
  monthDays,
} from "../dist/finance.js";
import { toMinor, fromMinor, exportCSV } from "../dist/money.js";
import { breakdown, trendChart } from "../dist/charts.js";
import { moneyFormat } from "../dist/views.js";

test("balances use minor units and exclude income from expense categories", () => {
  const rows = [
    { amount: 115, type: "expense", category: "dining" },
    { amount: 15, type: "expense", category: "dining" },
    { amount: 500, type: "income", category: "salary" },
  ];
  assert.deepEqual(totals(rows), {
    spent: 130,
    income: 500,
    net: 370,
    byCategory: { dining: 130 },
  });
});

test("month selection handles year boundaries, leap days and an empty ledger", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(monthDays("2024-02"), 29);
  assert.equal(monthDays("2025-02"), 28);
  assert.deepEqual(totals([]), { spent: 0, income: 0, net: 0, byCategory: {} });
  assert.doesNotMatch(
    trendChart([], "2025-02", "daily", String),
    /NaN|Infinity/,
  );
  assert.match(breakdown(totals([]), String), /Add an expense/);
});

test("daily and weekly trends reconcile to the same expenses", () => {
  const rows = demoData(new Date(2026, 0, 19))
    .filter((e) => e.kind === "tx")
    .map((e) => e.value);
  const expected = totals(
    rows.filter((e) => e.date.startsWith("2026-01")),
  ).spent;
  for (const mode of ["daily", "weekly"]) {
    assert.equal(
      series(rows, "2026-01", 19, mode).reduce((a, b) => a + b, 0),
      expected,
    );
  }
  assert.equal(
    Math.max(
      ...rows
        .filter((e) => e.date.startsWith("2026-01"))
        .map((e) => +e.date.slice(-2)),
    ),
    19,
  );
});

test("amounts round-trip in currencies with different minor-unit scales", () => {
  for (const [value, code, minor] of [
    ["1.15", "USD", 115],
    ["775", "JPY", 775],
    ["40.015", "KWD", 40015],
    ["125.50", "INR", 12550],
  ]) {
    assert.equal(toMinor(value, code), minor);
    assert.equal(toMinor(fromMinor(minor, code), code), minor);
  }
  assert.throws(() => toMinor("1.001", "USD"));
  assert.throws(() => toMinor("9007199254740992", "JPY"));
  assert.equal(moneyFormat("INR")(145000), "₹1,450");
});

test("CSV quotes descriptions and treats spreadsheet formulas as literal text", () => {
  const text = exportCSV(
    ["Description", "Amount"],
    [
      ['Coffee, "large"', 1.25],
      ["=SUM(A2:A9)", 3],
    ],
  );
  assert.match(text, /"Coffee, ""large"""/);
  assert.ok(text.includes('"\'=SUM(A2:A9)"'));
});
