# Sentry Integration Reference

Quick reference for Sentry webhooks, signature verification, and Issues API.

## Internal Integrations & Webhooks

### Creating an Internal Integration

1. Navigate to **Settings > Developer Settings** in sentry.io
2. Select "Create Integration" → "Internal Integration"
3. Set **Webhook URL** — specify the endpoint that will receive webhook events
4. Sentry auto-generates an authentication token (used in subsequent API calls)
5. Note the **Client Secret** — required for webhook signature verification

### Webhook Payload Structure

All webhooks share a common envelope with resource-specific `data`:

```json
{
  "action": "created|resolved|assigned|...",
  "installation": "<UUID>",
  "actor": {"type": "application|user"},
  "data": { /* resource-specific fields */ }
}
```

#### Issue Webhook (`action: created|resolved|...`)

```json
{
  "data": {
    "id": 12345,
    "title": "Error title [HIGH]",
    "culprit": "function_name",
    "permalink": "https://sentry.io/organizations/org/issues/12345/",
    "project": {
      "id": 1,
      "name": "My Project",
      "slug": "my-project",
      "platform": "javascript"
    },
    "url": "https://sentry.io/api/0/projects/org/my-project/issues/12345/",
    "status": "unresolved|resolved|ignored",
    "substatus": "escalating|regressed|new|archived_until_escalating"
  }
}
```

#### Issue Alert Webhook (`Sentry-Hook-Resource: event_alert`)

```json
{
  "action": "triggered",
  "data": {
    "event": {
      "url": "https://sentry.io/api/0/projects/org/project/events/event-id/",
      "web_url": "https://sentry.io/organizations/org/issues/12345/events/event-id/",
      "issue_id": 12345,
      "issue_url": "https://sentry.io/api/0/issues/12345/"
      /* full exception/stacktrace/browser context */
    },
    "triggered_rule": "Rule label",
    "issue_alert": {
      "title": "Rule name",
      "settings": [{"name": "key", "value": "val"}]
    }
  }
}
```

## Webhook Signature Verification

The `Sentry-Hook-Signature` header contains an HMAC-SHA256 signature of the raw request body, keyed by the integration's **Client Secret**.

### Node.js / TypeScript Verification

```typescript
import crypto from 'crypto';

export function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  clientSecret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', clientSecret)
    .update(rawBody)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In Express middleware:
app.post('/webhook', express.raw({type: 'application/json'}), (req, res) => {
  const signature = req.headers['sentry-hook-signature'] as string;
  const rawBody = req.body.toString();
  
  if (!verifyWebhookSignature(rawBody, signature, process.env.SENTRY_CLIENT_SECRET!)) {
    return res.status(401).json({error: 'Invalid signature'});
  }
  
  // Process webhook...
  res.sendStatus(200);
});
```

## Issues API

### List Project Issues

```
GET /api/0/projects/{org}/{project}/issues/
```

**Default behavior:** Returns unresolved issues only (`is:unresolved`).

**Query Parameters:**
- `query` — Sentry search syntax (ex: `is:resolved`, `is:error`, `age:-24h`)
- `statsPeriod` — `24h` (default), `14d`, or empty string to disable
- `sort` — `date`, `new`, `trends`, `freq`, `user`, or `recommended`
- `limit` — Max 100 per page

**Token Scopes Required:**
- `event:read` — minimum for read access

**Example:**
```bash
curl https://sentry.io/api/0/projects/myorg/myproject/issues/?query=is:unresolved \
  -H "Authorization: Bearer <token>"
```

### Resolve an Issue

```
PUT /api/0/organizations/{org}/issues/{issue_id}/
```

**Request Body:**
```json
{
  "status": "resolved|unresolved|ignored|resolvedInNextRelease|muted",
  "substatus": "escalating|regressed|new|archived_until_escalating|...",
  "assignedTo": "user_id|team:team_id",
  "priority": "low|medium|high"
}
```

**Token Scopes Required:**
- `event:write` or `event:admin` — to modify issues

**Example:**
```bash
curl -X PUT https://sentry.io/api/0/organizations/myorg/issues/12345/ \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"status":"resolved"}'
```

### List Organization Projects

```
GET /api/0/organizations/{org}/projects/
```

**Token Scopes Required:**
- `project:read` — for read access

## API Regions

| Region | Base URL |
|--------|----------|
| US (default) | `https://sentry.io` or `https://us.sentry.io` |
| EU (Germany) | `https://de.sentry.io` |

All API endpoints use the pattern: `https://{region}/api/0/{resource}`

**Token Scopes Summary:**
- `event:read` — read issues/events
- `event:write` — modify issue status/assignment
- `event:admin` — full issue management
- `project:read` — list/inspect projects
- `org:read` — org-level access

## References

- [Sentry Integration Platform](https://docs.sentry.io/integrations/integration-platform/)
- [Webhooks Documentation](https://docs.sentry.io/integrations/integration-platform/webhooks/)
- [Issues API](https://docs.sentry.io/api/events/list-a-projects-issues/)
- [Update Issue Endpoint](https://docs.sentry.io/api/events/update-an-issue/)
