import { Resend } from "resend";

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
  const inviteContext = projectName
    ? `You've been invited to join ${organizationName} on Focus: Forge and added to the project ${projectName}.`
    : `You've been invited to join ${organizationName} on Focus: Forge.`;
  const inviteSubject = projectName
    ? `You've been invited to ${projectName} in ${organizationName} on Focus: Forge`
    : `You've been invited to join ${organizationName} on Focus: Forge`;

  return sendEmailMessage({
    to,
    cc,
    subject: inviteSubject,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>You're Invited</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #18181b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #18181b; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #27272a; border-radius: 12px; border: 1px solid #3f3f46; overflow: hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #3f3f46;">
                      <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Focus: Forge</h1>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #ffffff;">
                        Hi ${fullName},
                      </h2>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #a1a1aa;">
                        ${
                          projectName
                            ? `You've been invited to join <strong style="color: #ffffff;">${organizationName}</strong> on Focus: Forge and added to the project <strong style="color: #ffffff;">${projectName}</strong>.`
                            : `You've been invited to join <strong style="color: #ffffff;">${organizationName}</strong> on Focus: Forge, a collaborative task management platform.`
                        }
                      </p>

                      <!-- CTA Button -->
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 8px 0 24px 0;">
                            <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background-color: #667eea; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                              Accept Invitation
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 20px; color: #71717a;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="margin: 0; font-size: 12px; line-height: 18px; color: #52525b; word-break: break-all;">
                        ${inviteUrl}
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding: 24px 32px; border-top: 1px solid #3f3f46; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #71717a;">
                        If you didn't expect this invitation, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
    text: `
Hi ${fullName},

${inviteContext}

Click the link below to accept the invitation:
${inviteUrl}

If you didn't expect this invitation, you can safely ignore this email.

- Focus: Forge Team
    `.trim(),
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
  return sendEmailMessage({
    to,
    subject: "Action required: set up two-factor authentication for Focus: Forge",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Set up two-factor authentication</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #18181b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #18181b; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #27272a; border-radius: 12px; border: 1px solid #3f3f46; overflow: hidden;">
                  <tr>
                    <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #3f3f46;">
                      <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Focus: Forge</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #ffffff;">
                        Hi ${name},
                      </h2>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #a1a1aa;">
                        We've enabled <strong style="color: #ffffff;">two-factor authentication (2FA)</strong> on Focus: Forge to keep your account secure. It's now <strong style="color: #ffffff;">required</strong>: the next time you sign in you'll be asked to set it up, and you won't be able to access the app until you do.
                      </p>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #a1a1aa;">
                        You'll need an authenticator app (1Password, Google Authenticator, Authy, etc.). Click below to sign in and set it up now:
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 8px 0 24px 0;">
                            <a href="${setupUrl}" style="display: inline-block; padding: 14px 32px; background-color: #667eea; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                              Set up two-factor authentication
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 20px; color: #71717a;">
                        Or copy and paste this link into your browser:
                      </p>
                      <p style="margin: 0; font-size: 12px; line-height: 18px; color: #52525b; word-break: break-all;">
                        ${setupUrl}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 24px 32px; border-top: 1px solid #3f3f46; text-align: center;">
                      <p style="margin: 0; font-size: 12px; color: #71717a;">
                        This is a one-time security setup. If you have questions, just reply to this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
    text: `
Hi ${name},

We've enabled two-factor authentication (2FA) on Focus: Forge to keep your account secure. It's now required — the next time you sign in you'll be asked to set it up, and you won't be able to access the app until you do.

You'll need an authenticator app (1Password, Google Authenticator, Authy, etc.). Set it up now:
${setupUrl}

This is a one-time security setup.

- Focus: Forge Team
    `.trim(),
  });
}

interface SendPasswordResetEmailParams {
  to: string;
  firstName: string;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  firstName,
  resetUrl,
}: SendPasswordResetEmailParams) {
  return sendEmailMessage({
    to,
    subject: "Reset your Focus: Forge password",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #18181b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #18181b; padding: 40px 20px;">
            <tr>
              <td align="center">
                <table width="100%" max-width="500" cellpadding="0" cellspacing="0" style="max-width: 500px; background-color: #27272a; border-radius: 12px; border: 1px solid #3f3f46;">
                  <tr>
                    <td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid #3f3f46;">
                      <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Focus: Forge</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #ffffff;">
                        Hi ${firstName || "there"},
                      </h2>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #a1a1aa;">
                        We received a request to reset your password. Click the button below to create a new password.
                      </p>
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td align="center" style="padding: 8px 0 24px 0;">
                            <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background-color: #667eea; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; border-radius: 8px;">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 0; font-size: 14px; line-height: 20px; color: #71717a;">
                        This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
    text: `
Hi ${firstName || "there"},

We received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.

- Focus: Forge Team
    `.trim(),
  });
}
