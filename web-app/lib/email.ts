import { Resend } from "resend";
import {
  InviteEmail,
  NotificationEmail,
  PasswordResetEmail,
  renderEmail,
} from "@the-portland-company/ui-email";

let _resend: Resend | null = null;

function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

// Default from address - update with your verified domain
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "noreply@focusforge.theportlandcompany.com";
const FROM_NAME = process.env.RESEND_FROM_NAME || "Focus: Forge";
const SITE_NAME = "Focus: Forge";

interface SendInviteEmailParams {
  to: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  projectName?: string;
  inviteUrl: string;
  cc?: string | string[];
}

interface SendEmailMessageParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  cc?: string | string[];
  /**
   * Optional RFC 5322 headers (e.g. Message-ID, In-Reply-To, References) used
   * to keep related notifications grouped in the same email thread.
   */
  headers?: Record<string, string>;
}

export async function sendEmailMessage({
  to,
  subject,
  html,
  text,
  cc,
  headers,
}: SendEmailMessageParams) {
  const { data, error } = await getResend().emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: Array.isArray(to) ? to : [to],
    ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
    ...(headers ? { headers } : {}),
    subject,
    html,
    text,
  });

  if (error) {
    console.error("Resend email error:", error);
    throw new Error(error.message || "Failed to send email");
  }

  return {
    provider: "Resend",
    messageId: data?.id || null,
    raw: data || null,
  };
}

export async function sendInviteEmail({
  to,
  firstName,
  lastName,
  organizationName,
  projectName,
  inviteUrl,
  cc,
}: SendInviteEmailParams) {
  const fullName = `${firstName} ${lastName}`.trim() || "there";
  const inviteSubject = projectName
    ? `You've been invited to ${projectName} in ${organizationName} on Focus: Forge`
    : `You've been invited to join ${organizationName} on Focus: Forge`;

  const teamName = projectName ? `${organizationName} (${projectName})` : organizationName;

  const { html, text } = await renderEmail(
    InviteEmail({
      inviterName: fullName !== "there" ? fullName : undefined,
      teamName,
      inviteUrl,
      siteName: SITE_NAME,
    }),
  );

  return sendEmailMessage({
    to,
    cc,
    subject: inviteSubject,
    html,
    text,
  });
}

interface SendMfaSetupEmailParams {
  to: string;
  firstName?: string;
  setupUrl: string;
}

export async function sendMfaSetupEmail({
  to,
  firstName,
  setupUrl,
}: SendMfaSetupEmailParams) {
  const name = (firstName || "").trim() || "there";
  const { html, text } = await renderEmail(
    NotificationEmail({
      title: "Set up two-factor authentication",
      body: `Hi ${name}, we've enabled two-factor authentication (2FA) on Focus: Forge to keep your account secure. It's now required: the next time you sign in you'll be asked to set it up, and you won't be able to access the app until you do. You'll need an authenticator app (1Password, Google Authenticator, Authy, etc.).`,
      ctaHref: setupUrl,
      ctaLabel: "Set up two-factor authentication",
      siteName: SITE_NAME,
    }),
  );
  return sendEmailMessage({
    to,
    subject: "Action required: set up two-factor authentication for Focus: Forge",
    html,
    text,
  });
}

interface SendMagicLinkEmailParams {
  to: string;
  firstName?: string;
  loginUrl: string;
}

export async function sendMagicLinkEmail({
  to,
  firstName,
  loginUrl,
}: SendMagicLinkEmailParams) {
  const name = (firstName || "").trim() || "there";
  const { html, text } = await renderEmail(
    NotificationEmail({
      title: "Your Focus: Forge login link",
      body: `Hi ${name}, click below to sign in to Focus: Forge. This link works once and expires shortly.`,
      ctaHref: loginUrl,
      ctaLabel: "Sign in to Focus: Forge",
      siteName: SITE_NAME,
    }),
  );
  return sendEmailMessage({
    to,
    subject: "Your Focus: Forge login link",
    html,
    text,
  });
}

interface SendPasswordResetEmailParams {
  to: string;
  firstName: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  resetUrl,
}: SendPasswordResetEmailParams) {
  const { html, text } = await renderEmail(
    PasswordResetEmail({
      resetHref: resetUrl,
      siteName: SITE_NAME,
      expiresInMinutes: 60,
    }),
  );
  return sendEmailMessage({
    to,
    subject: "Reset your Focus: Forge password",
    html,
    text,
  });
}
