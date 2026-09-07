// Sentry API Client
// Handles all direct communication with the Sentry API

import { createHmac, timingSafeEqual } from 'crypto'

import { SentryProject, SentryIssue } from '../sentry-types'

export interface SentryClientConfig {
  token: string
  orgSlug: string
  baseUrl?: string
}

export class SentryClient {
  private token: string
  private orgSlug: string
  private baseUrl: string

  constructor({ token, orgSlug, baseUrl = 'https://sentry.io' }: SentryClientConfig) {
    const trimmedToken = token?.trim()
    if (!trimmedToken) {
      throw new Error('Sentry auth token is required')
    }
    const trimmedOrg = orgSlug?.trim()
    if (!trimmedOrg) {
      throw new Error('Sentry organization slug is required')
    }
    this.token = trimmedToken
    this.orgSlug = trimmedOrg
    // Normalize: strip trailing slash so path joins are predictable
    this.baseUrl = (baseUrl?.trim() || 'https://sentry.io').replace(/\/+$/, '')
  }

  // ==================== API Methods ====================

  /**
   * List all projects in the organization.
   */
  async listProjects(): Promise<SentryProject[]> {
    return this.request(`/api/0/organizations/${this.orgSlug}/projects/`)
  }

  /**
   * List unresolved issues for a project, following Link-header pagination.
   * Caps the total at ~200 issues to avoid unbounded fetches.
   */
  async listUnresolvedIssues(
    projectSlug: string,
    statsPeriod: string = '90d'
  ): Promise<SentryIssue[]> {
    const params = new URLSearchParams({
      query: 'is:unresolved',
      statsPeriod
    })
    let url: string | null =
      `${this.baseUrl}/api/0/projects/${this.orgSlug}/${projectSlug}/issues/?${params}`

    const issues: SentryIssue[] = []
    const cap = 200

    while (url && issues.length < cap) {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers()
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Sentry API error: ${response.status} - ${error}`)
      }

      const page: SentryIssue[] = await response.json()
      issues.push(...page)

      url = this.nextPageUrl(response.headers.get('Link'))
    }

    return issues.slice(0, cap)
  }

  /**
   * Fetch a single issue by id.
   */
  async getIssue(issueId: string): Promise<SentryIssue> {
    return this.request(`/api/0/issues/${issueId}/`)
  }

  /**
   * Mark an issue as resolved.
   */
  async resolveIssue(issueId: string): Promise<void> {
    await this.request(`/api/0/issues/${issueId}/`, 'PUT', { status: 'resolved' })
  }

  // ==================== Webhook Verification ====================

  /**
   * Verify a Sentry webhook signature.
   * Sentry signs the raw request body with HMAC-SHA256 (hex) using the
   * integration's client secret, delivered in the `sentry-hook-signature` header.
   */
  static verifyWebhookSignature(
    rawBody: string,
    signatureHeader: string,
    secret: string
  ): boolean {
    if (!signatureHeader || !secret) {
      return false
    }

    const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')

    const expectedBuf = Buffer.from(expected, 'hex')
    let providedBuf: Buffer
    try {
      providedBuf = Buffer.from(signatureHeader.trim(), 'hex')
    } catch {
      return false
    }

    // timingSafeEqual throws if lengths differ; guard first (constant work).
    if (expectedBuf.length !== providedBuf.length) {
      return false
    }

    return timingSafeEqual(expectedBuf, providedBuf)
  }

  // ==================== Helper Methods ====================

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    }
  }

  private async request(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
    const options: RequestInit = {
      method,
      headers: this.headers()
    }

    if (body !== undefined && method !== 'GET') {
      options.body = JSON.stringify(body)
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, options)

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Sentry API error: ${response.status} - ${error}`)
    }

    // Some endpoints (e.g. resolveIssue) may return an empty/irrelevant body.
    const text = await response.text()
    if (!text) {
      return undefined
    }
    try {
      return JSON.parse(text)
    } catch {
      return undefined
    }
  }

  /**
   * Extract the `rel="next"` URL from a Sentry Link header when
   * `results="true"`; otherwise return null (no further pages).
   */
  private nextPageUrl(linkHeader: string | null): string | null {
    if (!linkHeader) {
      return null
    }

    // Link header entries are comma-separated; each looks like:
    // <https://sentry.io/...>; rel="next"; results="true"; cursor="..."
    for (const part of linkHeader.split(',')) {
      const segment = part.trim()
      if (!/rel="?next"?/.test(segment)) {
        continue
      }
      if (!/results="?true"?/.test(segment)) {
        return null
      }
      const match = segment.match(/<([^>]+)>/)
      if (match) {
        return match[1]
      }
    }

    return null
  }
}
