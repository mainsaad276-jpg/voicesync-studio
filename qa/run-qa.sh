#!/bin/bash
# VoiceSync Studio — automatic QA gate.
# Runs on every `git push` via the pre-push hook. Blocks the push if any check fails.
cd "$(dirname "$0")/.."
echo "=== VoiceSync QA: syntax ==="
for f in js/*.js; do
  node --check "$f" || { echo "SYNTAX FAIL: $f"; exit 1; }
done
echo "syntax OK"
echo "=== VoiceSync QA: 1000 automated tests ==="
node qa/qa-1000.js || { echo "QA SUITE FAILED — push blocked"; exit 1; }
echo "=== VoiceSync QA: Pro tier ==="
node qa/qa-pro.js || { echo "PRO QA FAILED — push blocked"; exit 1; }
echo "=== VoiceSync QA: ALL GREEN ==="
