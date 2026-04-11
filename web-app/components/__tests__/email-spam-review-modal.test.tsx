/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { scrollAndPulseSpamReviewThreadCard } from "../email-spam-review-modal";

test("scrollAndPulseSpamReviewThreadCard recenters the left thread card and replays the pulse", () => {
  const cancelled: string[] = [];
  let scrollOptions: ScrollIntoViewOptions | undefined;
  let animation:
    | { keyframes: Keyframe[]; options: KeyframeAnimationOptions | undefined }
    | undefined;

  const didAnimate = scrollAndPulseSpamReviewThreadCard({
    scrollIntoView(options) {
      scrollOptions = options;
    },
    getAnimations() {
      return [
        { cancel: () => cancelled.push("first") },
        { cancel: () => cancelled.push("second") },
      ];
    },
    animate(keyframes, options) {
      animation = { keyframes, options };
      return null;
    },
  });

  assert.equal(didAnimate, true);
  assert.deepEqual(scrollOptions, {
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
  assert.deepEqual(cancelled, ["first", "second"]);
  assert.equal(animation?.options?.iterations, 2);
  assert.equal(animation?.options?.easing, "ease-in-out");
  assert.equal(animation?.options?.duration, 640);
  assert.equal(animation?.keyframes.length, 3);
  assert.equal(animation?.keyframes[1]?.opacity, 0.84);
  assert.equal(
    animation?.keyframes[1]?.backgroundColor,
    "rgba(120, 53, 15, 0.18)",
  );
});

test("scrollAndPulseSpamReviewThreadCard is a no-op without a target", () => {
  assert.equal(scrollAndPulseSpamReviewThreadCard(null), false);
});
