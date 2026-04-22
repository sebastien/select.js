#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEFAULT_JSON="$ROOT/src/js/select.icons.json"
ICONS_API="https://api.iconify.design/collections"
USER_AGENT="select.js-icon-generator"

json_out="$DEFAULT_JSON"
write_json=1
print_stdout=0

usage() {
	printf '%s\n' "Usage: src/sh/select.icon.sh [--json-out PATH] [--stdout] [--no-json]"
}

while [ $# -gt 0 ]; do
	case "$1" in
		--json-out)
			shift
			json_out="$1"
			;;
		--stdout)
			print_stdout=1
			;;
		--no-json)
			write_json=0
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			printf '%s\n' "Unknown argument: $1" >&2
			usage >&2
			exit 1
			;;
	esac
	shift
done

if [ "$write_json" -eq 0 ] && [ "$print_stdout" -eq 0 ]; then
	printf '%s\n' "Nothing to do: enable at least one output target" >&2
	exit 1
fi

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON"' EXIT

curl -fsSL -A "$USER_AGENT" "$ICONS_API" -o "$TMP_JSON"

python3 - "$TMP_JSON" "$json_out" "$write_json" "$print_stdout" <<'PY'
import datetime
import json
import pathlib
import sys

raw_path = pathlib.Path(sys.argv[1])
json_out = pathlib.Path(sys.argv[2])
write_json = sys.argv[3] == "1"
print_stdout = sys.argv[4] == "1"

collections = json.loads(raw_path.read_text(encoding="utf-8"))
sources = {}

for prefix in sorted(collections):
	meta = collections[prefix]
	entry = {
		"url": f"https://api.iconify.design/{prefix}/__ICON_NAME__.svg",
		"collectionVersion": meta.get("version", "latest"),
	}
	height = meta.get("height")
	if isinstance(height, int) and height > 0:
		entry["size"] = [height, height]
	sources[prefix] = entry

payload = {
	"schemaVersion": 1,
	"generatedAt": datetime.datetime.now(datetime.UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
	"source": "https://api.iconify.design/collections",
	"count": len(sources),
	"sources": sources,
}

json_text = json.dumps(payload, ensure_ascii=True, indent="\t") + "\n"

if print_stdout:
	sys.stdout.write(json_text)

if write_json:
	json_out.parent.mkdir(parents=True, exist_ok=True)
	json_out.write_text(json_text, encoding="utf-8")
PY

if [ "$write_json" -eq 1 ]; then
	printf '%s\n' "[icon] JSON updated: $json_out"
fi

if command -v mise >/dev/null 2>&1; then
	files=()
	if [ "$write_json" -eq 1 ]; then
		files+=("$json_out")
	fi
	if [ "${#files[@]}" -gt 0 ]; then
		mise x -- bunx @biomejs/biome format --write "${files[@]}" >/dev/null 2>&1 || true
	fi
fi

# EOF
