#!/bin/bash
# usage: fetch_topic.sh <topic_id> <outdir>
set -u
TID="$1"; OUT="$2"
UA='zforum-research/0.1 (contact: th@bqp.io)'
mkdir -p "$OUT"
curl -sS -A "$UA" -o "$OUT/t$TID.json" "https://forum.zcashcommunity.com/t/$TID.json"
# all post ids in the stream
IDS=$(jq -r '.post_stream.stream[]?' "$OUT/t$TID.json")
N=0; BATCH=""
: > "$OUT/t$TID.posts.ndjson"
jq -c '.post_stream.posts[]?' "$OUT/t$TID.json" >> "$OUT/t$TID.posts.ndjson"
HAVE=$(jq -r '.post_stream.posts[]?.id' "$OUT/t$TID.json" | sort -n | tr '\n' ' ')
for id in $IDS; do
  case " $HAVE " in *" $id "*) continue;; esac
  BATCH="$BATCH&post_ids[]=$id"; N=$((N+1))
  if [ $N -ge 40 ]; then
    curl -sS -A "$UA" "https://forum.zcashcommunity.com/t/$TID/posts.json?${BATCH#&}" \
      | jq -c '.post_stream.posts[]?' >> "$OUT/t$TID.posts.ndjson"
    BATCH=""; N=0; sleep 1
  fi
done
if [ $N -gt 0 ]; then
  curl -sS -A "$UA" "https://forum.zcashcommunity.com/t/$TID/posts.json?${BATCH#&}" \
    | jq -c '.post_stream.posts[]?' >> "$OUT/t$TID.posts.ndjson"
fi
echo "topic $TID: $(wc -l < "$OUT/t$TID.posts.ndjson") posts fetched"
