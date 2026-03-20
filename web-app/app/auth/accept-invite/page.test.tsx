/* eslint-env node */
import test from 'node:test'
import assert from 'node:assert/strict'
import { getInviteStep } from './page'

test('getInviteStep requires password setup for unconfirmed invitees', () => {
  assert.equal(
    getInviteStep({
      hasSession: false,
      invitation: {
        email: 'invitee@example.com',
        firstName: 'Casey',
        lastName: 'Nguyen',
        status: 'pending',
        requiresPasswordSetup: true,
      },
    }),
    'setup-password'
  )
})

test('getInviteStep sends confirmed invitees to confirmation step', () => {
  assert.equal(
    getInviteStep({
      hasSession: false,
      invitation: {
        email: 'invitee@example.com',
        firstName: 'Casey',
        lastName: 'Nguyen',
        status: 'pending',
        requiresPasswordSetup: false,
      },
    }),
    'confirm'
  )
})

test('getInviteStep rejects a mismatched signed-in session', () => {
  assert.equal(
    getInviteStep({
      hasSession: true,
      sessionEmail: 'other@example.com',
      invitation: {
        email: 'invitee@example.com',
        firstName: 'Casey',
        lastName: 'Nguyen',
        status: 'pending',
        requiresPasswordSetup: false,
      },
    }),
    'error'
  )
})
