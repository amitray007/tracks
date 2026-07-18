export function normalizeServerUrl(value: string): string {
  const url = new URL(value);
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("Tracks Server URL must use http or https.");
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error("Tracks Server URL must not contain credentials, query parameters, or a fragment.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.toString().replace(/\/$/, "");
}

export function validateServerToken(token: string): string {
  const normalized = token.trim();
  if (normalized.length < 32) {
    throw new Error("Tracks Server token must contain at least 32 characters.");
  }
  if (normalized.length > 4_096) {
    throw new Error("Tracks Server token is too long.");
  }
  return normalized;
}

export async function verifyServerAccess(serverUrl: string, token: string): Promise<void> {
  const response = await fetch(`${serverUrl}/api/agent/access`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Tracks Server rejected the device token (${response.status}).`);
}
