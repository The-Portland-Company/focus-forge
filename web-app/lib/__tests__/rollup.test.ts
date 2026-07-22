import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  sumTimeEstimate,
  sumCost,
  formatDuration,
  taskTimeEstimate,
} from "../rollup";

describe("taskTimeEstimate", () => {
  test("reads either casing and coerces strings", () => {
    assert.equal(taskTimeEstimate({ time_estimate: 30 }), 30);
    assert.equal(taskTimeEstimate({ timeEstimate: "45" }), 45);
  });
  test("treats missing / non-positive as zero", () => {
    assert.equal(taskTimeEstimate({}), 0);
    assert.equal(taskTimeEstimate({ time_estimate: null }), 0);
    assert.equal(taskTimeEstimate({ time_estimate: -5 }), 0);
  });
});

describe("sumTimeEstimate", () => {
  test("sums estimates, excluding completed items", () => {
    const items = [
      { time_estimate: 60 },
      { time_estimate: 30, completed: true }, // excluded
      { timeEstimate: 15 },
    ];
    assert.equal(sumTimeEstimate(items), 75);
  });
  test("an empty list is zero", () => {
    assert.equal(sumTimeEstimate([]), 0);
  });
});

describe("sumCost", () => {
  test("mirrors supplyTotal, excluding completed supplies", () => {
    const items = [
      { is_supply: true, supply_price: 10, supply_quantity: 2 }, // 20
      { is_supply: true, supply_price: 5, completed: true }, // excluded
      { is_supply: false, time_estimate: 99 } as never,
    ];
    assert.equal(sumCost(items), 20);
  });
});

describe("formatDuration", () => {
  test("formats hours and minutes", () => {
    assert.equal(formatDuration(200), "3h 20m");
    assert.equal(formatDuration(120), "2h");
    assert.equal(formatDuration(45), "45m");
  });
  test("empty for zero", () => {
    assert.equal(formatDuration(0), "");
  });
});
