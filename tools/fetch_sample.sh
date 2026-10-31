#!/bin/bash
# Regenerates the 367-post research sample used to write SPEC.md.
# No authentication required. See SPEC.md §8.1.
#
#   usage: tools/fetch_sample.sh [outdir]
#
set -euo pipefail
OUT="${1:-data/sample}"
UA='zforum-research/0.1'
BASE='https://forum.zcashcommunity.com'
# The five threads sampled for SPEC.md §2. Titles in WORKLOG.md session 1.
TOPICS="58515 58566 58571 58610 53554"
mkdir -p "$OUT"

fetch_topic() {
  local tid="$1"
  curl -sS -A "$UA" -o "$OUT/t$tid.json" "$BASE/t/$tid.json"
  : > "$OUT/t$tid.posts.ndjson"
  jq -c '.post_stream.posts[]?' "$OUT/t$tid.json" >> "$OUT/t$tid.posts.ndjson"
  local have ids batch n
  have=" $(jq -r '.post_stream.posts[]?.id' "$OUT/t$tid.json" | tr '\n' ' ') "
  ids=$(jq -r '.post_stream.stream[]?' "$OUT/t$tid.json")
  batch=""; n=0
  for id in $ids; do
    case "$have" in *" $id "*) continue;; esac
    batch="$batch&post_ids[]=$id"; n=$((n+1))
    if [ "$n" -ge 40 ]; then
      curl -sS -A "$UA" "$BASE/t/$tid/posts.json?${batch#&}" \
        | jq -c '.post_stream.posts[]?' >> "$OUT/t$tid.posts.ndjson"
      batch=""; n=0; sleep 1
    fi
  done
  if [ "$n" -gt 0 ]; then
    curl -sS -A "$UA" "$BASE/t/$tid/posts.json?${batch#&}" \
      | jq -c '.post_stream.posts[]?' >> "$OUT/t$tid.posts.ndjson"
  fi
  echo "  t/$tid: $(wc -l < "$OUT/t$tid.posts.ndjson") posts"
}

echo "fetching ${TOPICS// /, } -> $OUT"
for t in $TOPICS; do fetch_topic "$t"; sleep 1; done
curl -sS -A "$UA" -o "$OUT/about.json"      "$BASE/about.json"
curl -sS -A "$UA" -o "$OUT/categories.json" "$BASE/categories.json"
echo "total: $(cat "$OUT"/t*.posts.ndjson | wc -l) posts"
echo
echo "plain text of a post (preferred over .cooked, see SPEC.md F-11):"
echo "  curl -sS -A '$UA' '$BASE/raw/<topic_id>/<post_number>'"
