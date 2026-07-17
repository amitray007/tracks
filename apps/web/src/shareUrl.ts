export const SESSION_SHARE_MODE = "session";

export function isSessionShareUrl(value: string): boolean {
  const url = new URL(value);
  return url.searchParams.get("share") === SESSION_SHARE_MODE
    && Boolean(url.searchParams.get("track"));
}

export function createSessionShareUrl(value: string, trackId: string): string {
  const url = new URL(value);
  url.searchParams.set("track", trackId);
  url.searchParams.set("share", SESSION_SHARE_MODE);
  url.searchParams.delete("group");
  return url.toString();
}
