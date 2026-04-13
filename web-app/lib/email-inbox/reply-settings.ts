export type EmailReplyConciseness = "brief" | "balanced" | "detailed";
export type EmailReplyTone = "neutral" | "friendly" | "warm" | "direct";
export type EmailReplyPersonality =
  | "professional"
  | "helpful"
  | "confident"
  | "calm";

export interface EmailReplySettings {
  conciseness: EmailReplyConciseness;
  tone: EmailReplyTone;
  personality: EmailReplyPersonality;
}

export type EmailReplySettingsOverride = Partial<EmailReplySettings>;

export const DEFAULT_EMAIL_REPLY_SETTINGS: EmailReplySettings = {
  conciseness: "brief",
  tone: "friendly",
  personality: "professional",
};

export const EMAIL_REPLY_CONCISENESS_OPTIONS: Array<{
  value: EmailReplyConciseness;
  label: string;
  description: string;
}> = [
  {
    value: "brief",
    label: "Brief",
    description: "1-2 short sentences when possible.",
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Short, but with a bit more context.",
  },
  {
    value: "detailed",
    label: "Detailed",
    description: "Longer, fuller replies when needed.",
  },
];

export const EMAIL_REPLY_TONE_OPTIONS: Array<{
  value: EmailReplyTone;
  label: string;
}> = [
  { value: "neutral", label: "Neutral" },
  { value: "friendly", label: "Friendly" },
  { value: "warm", label: "Warm" },
  { value: "direct", label: "Direct" },
];

export const EMAIL_REPLY_PERSONALITY_OPTIONS: Array<{
  value: EmailReplyPersonality;
  label: string;
}> = [
  { value: "professional", label: "Professional" },
  { value: "helpful", label: "Helpful" },
  { value: "confident", label: "Confident" },
  { value: "calm", label: "Calm" },
];

export function normalizeEmailReplySettings(
  value: unknown,
): EmailReplySettings {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<EmailReplySettings>)
      : {};

  return {
    conciseness:
      candidate.conciseness === "balanced" || candidate.conciseness === "detailed"
        ? candidate.conciseness
        : DEFAULT_EMAIL_REPLY_SETTINGS.conciseness,
    tone:
      candidate.tone === "neutral" ||
      candidate.tone === "warm" ||
      candidate.tone === "direct"
        ? candidate.tone
        : DEFAULT_EMAIL_REPLY_SETTINGS.tone,
    personality:
      candidate.personality === "helpful" ||
      candidate.personality === "confident" ||
      candidate.personality === "calm"
        ? candidate.personality
        : DEFAULT_EMAIL_REPLY_SETTINGS.personality,
  };
}

export function mergeEmailReplySettings(
  base: unknown,
  override?: EmailReplySettingsOverride | null,
) {
  return normalizeEmailReplySettings({
    ...normalizeEmailReplySettings(base),
    ...(override || {}),
  });
}
