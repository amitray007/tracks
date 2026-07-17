import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ViewerIdentity {
  login: string;
  name: string | null;
  avatarUrl: string;
}

let identityPromise: Promise<ViewerIdentity | null> | null = null;
let avatarPromise: Promise<{ body: Buffer; contentType: string } | null> | null = null;

async function readGitHubIdentity(): Promise<ViewerIdentity | null> {
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["api", "user", "--jq", "{login: .login, name: .name, avatarUrl: .avatar_url}"],
      { timeout: 3_000, maxBuffer: 64 * 1024 },
    );
    const value: unknown = JSON.parse(stdout);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (typeof record.login !== "string" || typeof record.avatarUrl !== "string") return null;
    return {
      login: record.login,
      name: typeof record.name === "string" && record.name.trim() ? record.name : null,
      avatarUrl: record.avatarUrl,
    };
  } catch {
    return null;
  }
}

export function getViewerIdentity(): Promise<ViewerIdentity | null> {
  identityPromise ??= readGitHubIdentity();
  return identityPromise;
}

export async function getViewerAvatar(): Promise<{ body: Buffer; contentType: string } | null> {
  avatarPromise ??= (async () => {
    const identity = await getViewerIdentity();
    if (!identity) return null;
    try {
      const response = await fetch(identity.avatarUrl, {
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return null;
      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "image/jpeg",
      };
    } catch {
      return null;
    }
  })();
  return avatarPromise;
}
