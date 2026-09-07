// Sentry Integration Types

// API Response Types from Sentry
export interface SentryProject {
  id: string
  slug: string
  name: string
  platform?: string
}

export interface SentryIssue {
  id: string
  shortId: string
  title: string
  culprit: string
  permalink: string
  level: string
  status: string
  count: string
  project: {
    slug: string
  }
}
