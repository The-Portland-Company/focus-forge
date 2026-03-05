import test from 'node:test'
import assert from 'node:assert/strict'

import { isDuplicateUserErrorMessage, normalizeInviteEmail } from './utils'

test('normalizeInviteEmail trims and lowercases input', () => {
  assert.equal(
    normalizeInviteEmail('  Spencer.Hill+Test@Example.COM  '),
    'spencer.hill+test@example.com'
  )
})

test('isDuplicateUserErrorMessage matches Supabase duplicate email variants', () => {
  assert.equal(
    isDuplicateUserErrorMessage('A user with this email address has already been registered'),
    true
  )
  assert.equal(isDuplicateUserErrorMessage('email_exists'), true)
  assert.equal(isDuplicateUserErrorMessage('Failed to send email'), false)
})
