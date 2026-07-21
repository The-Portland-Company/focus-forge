import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  supplyLineTotal,
  supplyTotal,
  supplyCount,
  hasSupplies,
  formatCurrency,
  formatQuantity,
  isSupply,
} from "../supply";

describe("supplyLineTotal", () => {
  test("multiplies quantity by price", () => {
    assert.equal(
      supplyLineTotal({ is_supply: true, supply_quantity: 3, supply_price: 2.5 }),
      7.5,
    );
  });

  test("treats a missing quantity as one", () => {
    assert.equal(supplyLineTotal({ is_supply: true, supply_price: 12.99 }), 12.99);
  });

  test("returns null for non-supplies and for supplies with no price", () => {
    assert.equal(supplyLineTotal({ is_supply: false, supply_price: 10 }), null);
    assert.equal(supplyLineTotal({ is_supply: true, supply_quantity: 4 }), null);
  });

  test("distinguishes a genuine zero from no amount", () => {
    assert.equal(supplyLineTotal({ is_supply: true, supply_price: 0 }), 0);
  });

  test("accepts PostgREST numeric strings", () => {
    assert.equal(
      supplyLineTotal({
        is_supply: true,
        supply_quantity: "2",
        supply_price: "10.50",
      }),
      21,
    );
  });

  test("accepts the camelCase Task shape", () => {
    assert.equal(
      supplyLineTotal({ isSupply: true, supplyQuantity: 2, supplyPrice: 3 }),
      6,
    );
  });

  test("rounds to cents rather than leaving float dust", () => {
    assert.equal(
      supplyLineTotal({ is_supply: true, supply_quantity: 3, supply_price: 0.1 }),
      0.3,
    );
  });

  test("ignores unparseable values", () => {
    assert.equal(
      supplyLineTotal({ is_supply: true, supply_price: "abc" }),
      null,
    );
  });
});

describe("supplyTotal", () => {
  const items = [
    { is_supply: true, supply_quantity: 2, supply_price: 10 },
    { is_supply: true, supply_quantity: 1, supply_price: 5.25 },
    { is_supply: false, supply_price: 999 },
    { is_supply: true },
    { name: "plain task" } as never,
  ];

  test("sums only computable supply lines", () => {
    assert.equal(supplyTotal(items), 25.25);
  });

  test("an empty list totals zero", () => {
    assert.equal(supplyTotal([]), 0);
  });

  test("does not accumulate float error across many lines", () => {
    const dust = Array.from({ length: 10 }, () => ({
      is_supply: true,
      supply_price: 0.1,
    }));
    assert.equal(supplyTotal(dust), 1);
  });
});

describe("supplyCount / hasSupplies / isSupply", () => {
  test("counts supplies regardless of whether they have a price", () => {
    assert.equal(
      supplyCount([
        { is_supply: true, supply_price: 1 },
        { is_supply: true },
        { is_supply: false },
      ]),
      2,
    );
  });

  test("hasSupplies is false for a list with none", () => {
    assert.equal(hasSupplies([{ is_supply: false }, {}]), false);
    assert.equal(hasSupplies([{ is_supply: true }]), true);
  });

  test("isSupply honours either casing", () => {
    assert.equal(isSupply({ isSupply: true }), true);
    assert.equal(isSupply({ is_supply: true }), true);
    assert.equal(isSupply({}), false);
  });
});

describe("formatting", () => {
  test("formats currency", () => {
    assert.equal(formatCurrency(1234.5), "$1,234.50");
    assert.equal(formatCurrency(0), "$0.00");
  });

  test("shows a dash when there is no amount", () => {
    assert.equal(formatCurrency(null), "—");
    assert.equal(formatCurrency(undefined), "—");
  });

  test("trims trailing zeros from quantities", () => {
    assert.equal(formatQuantity(2), "2");
    assert.equal(formatQuantity(2.5), "2.5");
    assert.equal(formatQuantity(null), "");
  });
});
