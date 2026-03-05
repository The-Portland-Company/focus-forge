const DUPLICATE_USER_ERROR = /already.*registered|already.*exists|duplicate|email_exists/i

export const normalizeInviteEmail = (email: string) => email.trim().toLowerCase()

export const isDuplicateUserErrorMessage = (message: string) =>
  DUPLICATE_USER_ERROR.test(message)
