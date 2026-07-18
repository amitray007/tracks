#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="${1:-}"
OUTPUT_DIR="${2:-$ROOT/release}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: pnpm release:cli <version> [output-directory]" >&2
  exit 1
fi

PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('$ROOT/apps/cli/package.json', 'utf8')).version")"
if [[ "$PACKAGE_VERSION" != "$VERSION" ]]; then
  echo "CLI package version $PACKAGE_VERSION does not match release version $VERSION." >&2
  exit 1
fi

STAGE="$OUTPUT_DIR/tracks-cli-$VERSION"
TARBALL="$OUTPUT_DIR/tracks-cli-$VERSION.tgz"
CHECKSUM="$TARBALL.sha256"

rm -rf "$STAGE" "$TARBALL" "$CHECKSUM"
mkdir -p "$OUTPUT_DIR"

cd "$ROOT"
pnpm build
pnpm --filter @tracks/cli deploy --prod --legacy "$STAGE"

rm -rf "$STAGE/src" "$STAGE/test"
rm -f "$STAGE/tsconfig.json" "$STAGE/tsconfig.build.json"
rm -f "$STAGE/node_modules/.modules.yaml" "$STAGE/node_modules/.pnpm/lock.yaml"
find "$STAGE" -type f \( -name "*.d.ts" -o -name "*.d.ts.map" -o -name "*.js.map" \) -delete
find "$STAGE/node_modules" -depth -path "*/.bin/*" -delete
cp -R "$ROOT/apps/web/dist" "$STAGE/web"
cp "$ROOT/LICENSE" "$STAGE/LICENSE"

if grep -r -F -l "$ROOT" "$STAGE" >/dev/null 2>&1 \
  || grep -r -F -l "$HOME" "$STAGE" >/dev/null 2>&1; then
  echo "Release bundle contains an absolute build-machine path." >&2
  exit 1
fi

if tar --version 2>/dev/null | grep -q "GNU tar"; then
  SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-$(git -C "$ROOT" log -1 --format=%ct)}"
  tar \
    --sort=name \
    --mtime="@$SOURCE_DATE_EPOCH" \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    -czf "$TARBALL" \
    -C "$STAGE" .
else
  COPYFILE_DISABLE=1 tar -czf "$TARBALL" -C "$STAGE" .
fi

if command -v sha256sum >/dev/null 2>&1; then
  SHA256="$(sha256sum "$TARBALL" | awk '{print $1}')"
else
  SHA256="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
fi
printf '%s  %s\n' "$SHA256" "$(basename "$TARBALL")" > "$CHECKSUM"

echo "$TARBALL"
echo "$CHECKSUM"
