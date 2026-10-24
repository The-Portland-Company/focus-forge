/* eslint-env node */
import test from "node:test";
import assert from "node:assert/strict";
import { renderEmail, InviteEmail, NotificationEmail, PasswordResetEmail } from "@the-portland-company/ui-email";

// These exercise the same template construction used by lib/email.ts's
// sendInviteEmail / sendMfaSetupEmail / sendMagicLinkEmail /
// sendPasswordResetEmail, without going through the Resend transport
// (no RESEND_API_KEY needed).

test("invite email includes organization, project, and invite link", async () => {
  const organizationName = "Acme Co";
  const projectName = "Launch Plan";
  const teamName = `${organizationName} (${projectName})`;
  const { html, text } = await renderEmail(
    InviteEmail({
      inviterName: "Jamie Doe",
      teamName,
      inviteUrl: "https://focusforge.dev/invite/abc123",
      siteName: "Focus: Forge",
    }),
  );
  assert.match(html, /Acme Co/);
  assert.match(html, /Launch Plan/);
  assert.match(html, /invite\/abc123/);
  assert.match(text, /Acme Co/);
});

test("invite email without project name falls back to org-only team name", async () => {
  const { html } = await renderEmail(
    InviteEmail({
      teamName: "Acme Co",
      inviteUrl: "https://focusforge.dev/invite/xyz789",
      siteName: "Focus: Forge",
    }),
  );
  assert.match(html, /Acme Co/);
  assert.doesNotMatch(html, /Acme Co \(/);
});

test("mfa setup email includes setup link", async () => {
  const { html, text } = await renderEmail(
    NotificationEmail({
      title: "Set up two-factor authentication",
      body: "Hi there, we've enabled two-factor authentication (2FA) on Focus: Forge.",
      ctaHref: "https://focusforge.dev/mfa/setup?token=abc",
      ctaLabel: "Set up two-factor authentication",
      siteName: "Focus: Forge",
    }),
  );
  assert.match(html, /mfa\/setup\?token=abc/);
  assert.match(text, /two-factor authentication/);
});

test("magic link email includes login link", async () => {
  const { html } = await renderEmail(
    NotificationEmail({
      title: "Your Focus: Forge login link",
      body: "Hi there, click below to sign in to Focus: Forge.",
      ctaHref: "https://focusforge.dev/auth/magic?token=xyz",
      ctaLabel: "Sign in to Focus: Forge",
      siteName: "Focus: Forge",
    }),
  );
  assert.match(html, /auth\/magic\?token=xyz/);
});

test("password reset email includes reset link", async () => {
  const { html, text } = await renderEmail(
    PasswordResetEmail({
      resetHref: "https://focusforge.dev/reset?token=def456",
      siteName: "Focus: Forge",
      expiresInMinutes: 60,
    }),
  );
  assert.match(html, /reset\?token=def456/);
  assert.match(text, /60/);
});
