import { SignJWT, importPKCS8 } from "jose";

export type ApnsEnvironment = "sandbox" | "production";

export type ApnsSendRequest = {
  deviceToken: string;
  topic: string;
  environment: ApnsEnvironment;
  payload: Record<string, unknown>;
  collapseId?: string;
  pushType?: "alert" | "background";
  priority?: "5" | "10";
};

export type ApnsSendResult =
  | {
      ok: true;
      status: number;
    }
  | {
      ok: false;
      status: number;
      reason: string | null;
      responseText: string | null;
    };

type ApnsConfig = {
  keyId: string;
  teamId: string;
  privateKey: string;
};

type CachedBearerToken = {
  keyId: string;
  teamId: string;
  value: string;
  expiresAt: number;
};

const APNS_HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};

let cachedBearerToken: CachedBearerToken | null = null;

export function normalizeApnsPrivateKey(value: string) {
  const normalized = value.trim().replace(/\\n/g, "\n");
  if (normalized.includes("BEGIN PRIVATE KEY")) {
    return normalized;
  }

  return [
    "-----BEGIN PRIVATE KEY-----",
    normalized,
    "-----END PRIVATE KEY-----",
  ].join("\n");
}

export function hasApnsConfiguration() {
  return Boolean(
    process.env.APPLE_PUSH_KEY_ID?.trim() &&
      process.env.APPLE_PUSH_TEAM_ID?.trim() &&
      process.env.APPLE_PUSH_PRIVATE_KEY?.trim(),
  );
}

export function isApnsPermanentFailure(result: ApnsSendResult) {
  if (result.ok) {
    return false;
  }

  if (result.status === 410) {
    return true;
  }

  return new Set([
    "BadDeviceToken",
    "DeviceTokenNotForTopic",
    "TopicDisallowed",
    "Unregistered",
  ]).has(String(result.reason || ""));
}

function getApnsConfig(): ApnsConfig | null {
  const keyId = process.env.APPLE_PUSH_KEY_ID?.trim();
  const teamId = process.env.APPLE_PUSH_TEAM_ID?.trim();
  const privateKey = process.env.APPLE_PUSH_PRIVATE_KEY?.trim();

  if (!keyId || !teamId || !privateKey) {
    return null;
  }

  return {
    keyId,
    teamId,
    privateKey: normalizeApnsPrivateKey(privateKey),
  };
}

async function createPrivateKey(config: ApnsConfig) {
  return importPKCS8(config.privateKey, "ES256");
}

async function getBearerToken(config: ApnsConfig) {
  const now = Math.floor(Date.now() / 1000);

  if (
    cachedBearerToken &&
    cachedBearerToken.keyId === config.keyId &&
    cachedBearerToken.teamId === config.teamId &&
    cachedBearerToken.expiresAt > now
  ) {
    return cachedBearerToken.value;
  }

  const privateKey = await createPrivateKey(config);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt(now)
    .sign(privateKey);

  cachedBearerToken = {
    keyId: config.keyId,
    teamId: config.teamId,
    value: token,
    expiresAt: now + 50 * 60,
  };

  return token;
}

export async function sendApnsNotification(
  request: ApnsSendRequest,
): Promise<ApnsSendResult> {
  const config = getApnsConfig();
  if (!config) {
    return {
      ok: false,
      status: 0,
      reason: "missing_credentials",
      responseText: null,
    };
  }

  let response: Response;
  try {
    const bearerToken = await getBearerToken(config);
    response = await fetch(
      `${APNS_HOSTS[request.environment]}/3/device/${request.deviceToken}`,
      {
        method: "POST",
        headers: {
          authorization: `bearer ${bearerToken}`,
          "apns-topic": request.topic,
          "apns-push-type": request.pushType ?? "alert",
          "apns-priority": request.priority ?? "10",
          ...(request.collapseId
            ? { "apns-collapse-id": request.collapseId }
            : {}),
        },
        body: JSON.stringify(request.payload),
        cache: "no-store",
      },
    );
  } catch (error) {
    return {
      ok: false,
      status: 0,
      reason:
        error instanceof Error ? error.message : "apns_request_failed",
      responseText: null,
    };
  }

  if (response.ok) {
    return {
      ok: true,
      status: response.status,
    };
  }

  const responseText = (await response.text()) || null;
  let reason: string | null = null;

  if (responseText) {
    try {
      const payload = JSON.parse(responseText) as { reason?: string };
      reason = payload.reason ?? null;
    } catch {
      reason = responseText;
    }
  }

  return {
    ok: false,
    status: response.status,
    reason,
    responseText,
  };
}
