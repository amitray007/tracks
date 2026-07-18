import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const workspaceRoots = ["apps", "packages"];
const mismatches = [];

for (const workspaceRoot of workspaceRoots) {
  const directory = new URL(`../${workspaceRoot}/`, import.meta.url);

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const relativePath = join(workspaceRoot, entry.name, "package.json");
    const packageJson = JSON.parse(
      await readFile(new URL(`../${relativePath}`, import.meta.url), "utf8"),
    );

    if (packageJson.version !== root.version) {
      mismatches.push(`${relativePath}: ${packageJson.version ?? "missing"}`);
    }
  }
}

if (mismatches.length > 0) {
  console.error(`Workspace package versions must match root version ${root.version}:`);
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exitCode = 1;
} else {
  console.log(`All workspace packages are version ${root.version}.`);
}
