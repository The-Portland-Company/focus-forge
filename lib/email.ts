import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

// Default from address - update with your verified domain
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@commandcenter.app'
const FROM_NAME = process.env.RESEND_FROM_NAME || 'Command Center'

interface SendInviteEmailParams {
  to: string
  firstName: string
  lastName: string
  organizationName: string
  inviteUrl: string
  cc?: string | string[]
}

export async function sendInviteEmail({
  to,
  firstName,
  lastName,
  organizationName,
  inviteUrl,
  cc
}: SendInviteEmailParams) {
  const fullName = `${firstName} ${lastName}`.trim() || 'there'

  const { data, error } = await getResend().emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: [to],
    ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
    subject: `You've been invited to join ${organizationName} on Command Center`,
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
                      <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Command Center</h1>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #ffffff;">
                        Hi ${fullName},
                      </h2>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #a1a1aa;">
                        You've been invited to join <strong style="color: #ffffff;">${organizationName}</strong> on Command Center, a collaborative task management platform.
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

You've been invited to join ${organizationName} on Command Center.

Click the link below to accept the invitation:
${inviteUrl}

If you didn't expect this invitation, you can safely ignore this email.

- Command Center Team
    `.trim()
  })

  if (error) {
    console.error('Resend email error:', error)
    throw new Error(error.message || 'Failed to send email')
  }

  return data
}

interface SendPasswordResetEmailParams {
  to: string
  firstName: string
  resetUrl: string
}

export async function sendPasswordResetEmail({
  to,
  firstName,
  resetUrl
}: SendPasswordResetEmailParams) {
  const { data, error } = await getResend().emails.send({
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to: [to],
    subject: 'Reset your Command Center password',
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
                      <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">Command Center</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 32px;">
                      <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 600; color: #ffffff;">
                        Hi ${firstName || 'there'},
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
Hi ${firstName || 'there'},

We received a request to reset your password. Click the link below to create a new password:

${resetUrl}

This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.

- Command Center Team
    `.trim()
  })

  if (error) {
    console.error('Resend email error:', error)
    throw new Error(error.message || 'Failed to send email')
  }

  return data
}
