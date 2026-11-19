#!/bin/sh
# Minimal kane-cli stand-in for tests: enough surface to prove both-ends wires
# the real commands correctly, without needing an account or credits.
case "$1" in
  --version)
    echo "0.0.0-stub"
    exit 0
    ;;
  whoami)
    echo "Identity"
    echo "Profile default"
    exit 0
    ;;
  evidence)
    sub="$2"
    shift 2
    if [ "$sub" = "lint-policy" ]; then
      echo "$1: ok"
      exit 0
    fi
    if [ "$sub" = "merge" ]; then
      out=""
      prev=""
      for a in "$@"; do
        if [ "$prev" = "-o" ] || [ "$prev" = "--out" ]; then out="$a"; fi
        prev="$a"
      done
      if [ -z "$out" ]; then echo "stub: merge needs -o" >&2; exit 2; fi
      mkdir -p "$(dirname "$out")"
      printf 'STUB-PACK' > "$out"
      echo "{\"run_id\":\"stub-run\",\"path\":\"$out\",\"merged\":true}"
      exit 0
    fi
    exit 0
    ;;
  run)
    target="simulator"
    prev=""
    for a in "$@"; do
      if [ "$prev" = "--target" ]; then target="$a"; fi
      prev="$a"
    done
    surface="desktop"
    if [ "$target" = "simulator" ]; then surface="simulator"; fi
    fixed="${STUB_FIXTURES:-fixtures/demo/loop-1}/$surface.ndjson"
    if [ ! -f "$fixed" ]; then echo "{\"type\":\"run_end\",\"status\":\"failed\"}"; exit 1; fi
    cat "$fixed"
    if grep -q '"status":"failed"' "$fixed"; then exit 1; fi
    exit 0
    ;;
  *)
    exit 0
    ;;
esac
