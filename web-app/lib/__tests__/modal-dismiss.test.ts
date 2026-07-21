import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  shouldDismissOnOutsidePointer,
  LAYERED_UI_SELECTOR,
} from "../modal-dismiss";

/** Minimal stand-in for an event target; `inside` fakes container.contains. */
function node(options: {
  isConnected?: boolean;
  layer?: boolean;
} = {}) {
  return {
    isConnected: options.isConnected ?? true,
    closest: (selector: string) =>
      options.layer && selector === LAYERED_UI_SELECTOR ? {} : null,
  };
}

const containerHolding = (...held: unknown[]) => ({
  contains: (n: unknown) => held.includes(n),
});

describe("outside-pointer dismissal", () => {
  test("a click on the backdrop dismisses", () => {
    assert.equal(
      shouldDismissOnOutsidePointer(node(), containerHolding()),
      true,
    );
  });

  test("a click inside the modal does not dismiss", () => {
    const target = node();
    assert.equal(
      shouldDismissOnOutsidePointer(target, containerHolding(target)),
      false,
    );
  });

  test("a target detached by the same interaction does not dismiss", () => {
    // An onMouseDown that unmounts what was clicked (picking an @-mention)
    // leaves a detached node, which contains() reports as outside.
    assert.equal(
      shouldDismissOnOutsidePointer(
        node({ isConnected: false }),
        containerHolding(),
      ),
      false,
    );
  });

  test("a click in a portalled layer does not dismiss", () => {
    // Nested confirm dialogs, selects and menus render outside the subtree.
    assert.equal(
      shouldDismissOnOutsidePointer(node({ layer: true }), containerHolding()),
      false,
    );
  });

  test("a missing target does not dismiss", () => {
    assert.equal(shouldDismissOnOutsidePointer(null, containerHolding()), false);
  });

  test("a missing container still allows dismissal", () => {
    assert.equal(shouldDismissOnOutsidePointer(node(), null), true);
  });

  test("a target without closest() is handled", () => {
    assert.equal(
      shouldDismissOnOutsidePointer({ isConnected: true }, containerHolding()),
      true,
    );
  });
});
