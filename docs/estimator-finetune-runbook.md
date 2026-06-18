# Estimator fine-tune runbook (Phase 2)

How to produce and ship the platform fine-tuned time-estimator: a **LoRA adapter
on Gemma-2B-it served by Cloudflare Workers AI**. The app code (export, provider,
model registration) is in place; training is an **offline operator step**.

See the plan: `~/.claude/plans/gentle-swinging-cloud.md`. Forge: Phase 2 task
`8249b5f5`.

## What's already wired in the app

- **Consent:** `profiles.contributes_training_data` (default false). Only opted-in
  users' examples enter the pooled dataset.
- **Dataset export:** `GET /api/admin/fine-tune/export` (admin-gated) streams
  chat-format JSONL built from opted-in `task_estimate_examples` via
  `lib/ai-estimator/training-export.ts`. The prompt format is the estimator's
  own `SYSTEM_PROMPT` + `buildUserMessage`, so train == inference.
- **Serving:** `cf-workers-ai` provider in `lib/ai/structured-waterfall.ts`,
  model id `ff-estimator-gemma2b` registered in `lib/ai/model-chains.ts`
  (selectable, NOT auto-added to anyone's chain). Adapter name overridable via
  `CF_ESTIMATOR_LORA`.
- **Job tracking:** `fine_tune_jobs` table.
- **Env needed for serving:** `CLOUDFLARE_API_TOKEN` (Workers AI),
  `CLOUDFLARE_ACCOUNT_ID`, optional `CF_ESTIMATOR_LORA`.

## Steps

1. **Gather consent.** Ensure target users have `contributes_training_data = true`
   (HITL UI toggle / admin update). Without opt-ins the export returns 422.
2. **Export the dataset.** As an admin, `GET /api/admin/fine-tune/export` →
   `estimator-finetune-<N>.jsonl`. Sanity check: each line is
   `{"messages":[system,user,assistant]}`, assistant is valid JSON with
   `minutes` in 1–480. Hold out ~10–15% for evaluation.
3. **Train the LoRA** (offline GPU / HuggingFace AutoTrain — Cloudflare has an
   AutoTrain→Workers-AI tutorial). Base: `google/gemma-2b-it`. LoRA **rank ≤ 8**
   (Workers AI requirement), non-quantized. Set `adapter_config.json`
   `model_type: "gemma"`. Keep epochs low (2–3) to avoid overfitting a small set.
4. **Upload the adapter to Workers AI** as a finetune named to match
   `CF_ESTIMATOR_LORA` (default `ff-estimator-gemma2b`). Confirm a test
   `ai/run/@cf/google/gemma-2b-it-lora` call with `lora` set returns JSON.
5. **Evaluate** on the held-out set: compare fine-tune vs the frontier baseline
   by mean absolute error (minutes). Only promote if MAE is competitive.
6. **Activate.** Set `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (and
   `CF_ESTIMATOR_LORA` if non-default) in the Railway env. Users can then place
   **Focus Forge Estimator (fine-tuned, Gemma-2B)** in their estimator chain
   (Settings → AI model order). It is last-resort safe: if it errors, the
   waterfall falls through to the frontier models.
7. **Record** the run in `fine_tune_jobs` (adapter_ref, example_count, metrics).

## Notes / guardrails

- The fine-tuned model is **opt-in per user** — never forced into a chain.
- LoRA rank must stay ≤ 8 (≤ 32 in some cases) and the base model
  non-quantized, per Workers AI LoRA limits.
- DeepSeek-R1-distill (stronger reasoning) is **not** on Workers AI; if desired,
  self-host behind an OpenAI-compatible endpoint and wire via the BYO-endpoint
  path in Phase 3 (`8249b5f5` → `e7ab815e`).
- Per-user adapters are Phase 4 (`c09d0e14`): reuse this pipeline with
  `fine_tune_jobs.scope = 'user'` and `created_by`.
