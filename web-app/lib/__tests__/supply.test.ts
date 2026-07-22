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
  supplyIdentityKind,
  supplyIdentityLabel,
  deriveSupplyName,
  taskDisplayName,
  parseSupplyVendor,
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

describe("completed supplies are deducted from totals", () => {
  const items = [
    { is_supply: true, supply_quantity: 2, supply_price: 10 }, // 20
    { is_supply: true, supply_price: 5.25, completed: true }, // acquired, deducted
    { is_supply: true, supply_price: 4 }, // 4
  ];

  test("supplyTotal excludes completed supplies", () => {
    assert.equal(supplyTotal(items), 24);
  });

  test("supplyCount counts only outstanding supplies", () => {
    assert.equal(supplyCount(items), 2);
  });

  test("a fully-acquired list totals zero but still has supplies", () => {
    const done = [{ is_supply: true, supply_price: 9, completed: true }];
    assert.equal(supplyTotal(done), 0);
    assert.equal(supplyCount(done), 0);
    assert.equal(hasSupplies(done), true);
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

describe("supply identity", () => {
  test("make/model wins and joins into one label", () => {
    const item = { supply_make: "DeWalt", supply_model: "DCD771C2" };
    assert.equal(supplyIdentityKind(item), "make-model");
    assert.equal(supplyIdentityLabel(item), "DeWalt DCD771C2");
  });

  test("a lone make or model still reads as make/model", () => {
    assert.equal(supplyIdentityKind({ supplyMake: "Milwaukee" }), "make-model");
    assert.equal(supplyIdentityLabel({ supplyModel: "M18" }), "M18");
  });

  test("type is used when no make/model is present", () => {
    const item = { supply_type: "2x6x8 doug fir" };
    assert.equal(supplyIdentityKind(item), "type");
    assert.equal(supplyIdentityLabel(item), "2x6x8 doug fir");
  });

  test("supplies predating these fields have no identity", () => {
    assert.equal(supplyIdentityKind({ is_supply: true }), null);
    assert.equal(supplyIdentityLabel({ is_supply: true }), null);
  });
});

describe("vendor links", () => {
  test("labels an http(s) url by site name, without www", () => {
    const parsed = parseSupplyVendor({
      supply_vendor: "https://www.homedepot.com/p/12345",
    });
    assert.equal(parsed?.label, "homedepot.com");
    assert.equal(parsed?.url, "https://www.homedepot.com/p/12345");
  });

  test("promotes a bare domain to https", () => {
    const parsed = parseSupplyVendor({ supply_vendor: "lowes.com/store" });
    assert.equal(parsed?.label, "lowes.com");
    assert.equal(parsed?.url, "https://lowes.com/store");
  });

  test("a plain name stays text, not a link", () => {
    const parsed = parseSupplyVendor({ supply_vendor: "Home Depot" });
    assert.equal(parsed?.label, "Home Depot");
    assert.equal(parsed?.url, null);
  });

  test("non-http schemes are never linkified", () => {
    for (const vendor of ["javascript:alert(1)", "data:text/html,hi"]) {
      const parsed = parseSupplyVendor({ supply_vendor: vendor });
      assert.equal(parsed?.url, null, `${vendor} must not become a link`);
    }
  });

  test("no vendor yields nothing", () => {
    assert.equal(parseSupplyVendor({ supply_vendor: null }), null);
  });
});

describe("deriveSupplyName", () => {
  test("prefers the make/model identity", () => {
    assert.equal(
      deriveSupplyName(
        { is_supply: true, supply_make: "DeWalt", supply_model: "DCD771C2" },
        "typed title",
      ),
      "DeWalt DCD771C2",
    );
  });

  test("uses the type when there is no make/model", () => {
    assert.equal(
      deriveSupplyName({ is_supply: true, supply_type: "2x6x8 doug fir" }),
      "2x6x8 doug fir",
    );
  });

  test("falls back to the vendor site name, then the typed title", () => {
    assert.equal(
      deriveSupplyName({
        is_supply: true,
        supply_vendor: "https://www.lowes.com/store",
      }),
      "lowes.com",
    );
    assert.equal(deriveSupplyName({ is_supply: true }, "  bolts  "), "bolts");
  });

  test("never returns an empty name", () => {
    assert.equal(deriveSupplyName({ is_supply: true }), "Supply");
    assert.equal(deriveSupplyName({ is_supply: true }, "   "), "Supply");
  });
});

describe("taskDisplayName", () => {
  test("a supply shows its identity instead of the stored name, as an action", () => {
    assert.equal(
      taskDisplayName(
        { is_supply: true, supply_type: "3in deck screws" },
        "3in deck screws",
      ),
      "Acquire 3in deck screws",
    );
    assert.equal(
      taskDisplayName(
        { is_supply: true, supply_make: "Makita", supply_model: "XPH12Z" },
        "stale name",
      ),
      "Acquire Makita XPH12Z",
    );
  });

  test("an ordinary task keeps its name", () => {
    assert.equal(taskDisplayName({ is_supply: false }, "Call the framer"), "Call the framer");
  });

  test("a supply with no identity fields falls back to its stored name", () => {
    assert.equal(taskDisplayName({ is_supply: true }, "Legacy supply"), "Legacy supply");
  });
});

describe("supply display name", () => {
  test("a non-supply keeps its own name", () => {
    assert.equal(taskDisplayName({ is_supply: false }, "Frame the wall"), "Frame the wall");
  });

  test("a supply shows its identity over the stored name, as an action", () => {
    assert.equal(
      taskDisplayName({ is_supply: true, supply_make: "DeWalt", supply_model: "DCD771C2" }, "DeWalt DCD999"),
      "Acquire DeWalt DCD771C2",
    );
  });

  test("cleared identity falls back to the vendor, not a stale stored name", () => {
    assert.equal(
      taskDisplayName(
        { is_supply: true, supply_vendor: "https://www.homedepot.com/p/1" },
        "DeWalt DCD771C2",
      ),
      "Acquire homedepot.com",
    );
  });

  test("with nothing to derive from, the stored name is used unprefixed", () => {
    // It may already read as an action, so it is not double-prefixed.
    assert.equal(taskDisplayName({ is_supply: true }, "Lumber"), "Lumber");
  });
});
