import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export async function resolveWebDirectory(): Promise<string> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDirectory, "..", "web"),
    join(moduleDirectory, "..", "..", "web", "dist"),
  ];

  for (const candidate of candidates) {
    try {
      await access(join(candidate, "index.html"), constants.R_OK);
      return candidate;
    } catch {
      // Try the next supported installation layout.
    }
  }

  throw new Error(
    "Tracks could not find the web viewer. Reinstall the CLI or run pnpm build in the source checkout.",
  );
}
