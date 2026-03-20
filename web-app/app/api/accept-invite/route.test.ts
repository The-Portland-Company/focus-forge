/* eslint-env node */
import test from 'node:test'
import assert from 'node:assert/strict'
import { inviteRequiresPasswordSetup } from './route'

test('inviteRequiresPasswordSetup is true when email is unconfirmed', () => {
  assert.equal(inviteRequiresPasswordSetup(null), true)
  assert.equal(inviteRequiresPasswordSetup(undefined), true)
})

test('inviteRequiresPasswordSetup is false for confirmed accounts', () => {
  assert.equal(inviteRequiresPasswordSetup('2026-03-20T03:00:00.000Z'), false)
})
