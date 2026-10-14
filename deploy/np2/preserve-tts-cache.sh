#!/bin/bash
# Copy private cached recordings before the old checkout is removed.
set -euo pipefail
legacy="$1"
destination="$2"
[[ -d "$legacy" ]] || exit 0
mkdir -p -m 700 "$destination"
manifest="$(mktemp)"
temporary="$(mktemp "$destination/.np-copy-XXXXXX")"
trap 'rm -f -- "$manifest" "$temporary"' EXIT
find "$legacy" -maxdepth 1 -type f -name '*.glite4*.parts' -print0 > "$manifest"
while IFS= read -r -d '' file; do
  target="$destination/$(basename "$file")"
  # Reuse newer/persistent entries; no copy of temporary or unrelated files.
  if [[ ! -e "$target" ]]; then
    cp -p -- "$file" "$temporary"
    chmod 600 "$temporary"
    mv -n -- "$temporary" "$target"
    temporary="$(mktemp "$destination/.np-copy-XXXXXX")"
  fi
done < "$manifest"
