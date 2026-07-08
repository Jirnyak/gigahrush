#!/usr/bin/env bash
set -e

FAILED_LIST="merge_logs/failed_tests.txt"
if [ ! -f "$FAILED_LIST" ]; then
    echo "No failed tests list."
    exit 1
fi

BRANCHES=$(cat "$FAILED_LIST")
TOTAL=$(echo "$BRANCHES" | wc -w)
CURRENT=1

SUCCESS=0
FAILED=0
CONFLICTED=0

for BRANCH in $BRANCHES; do
    echo "=================================================="
    echo "Retrying $BRANCH ($CURRENT / $TOTAL)"
    echo "=================================================="
    
    if git merge "$BRANCH" -m "Merge branch $BRANCH"; then
        if npm run check:readonly; then
            echo "SUCCESS: $BRANCH merged and passed!"
            SUCCESS=$((SUCCESS + 1))
        else
            echo "FAILED tests: $BRANCH. Aborting merge."
            git reset --hard HEAD~1
            FAILED=$((FAILED + 1))
        fi
    else
        echo "CONFLICT: $BRANCH. Aborting merge."
        git merge --abort
        CONFLICTED=$((CONFLICTED + 1))
    fi
    
    CURRENT=$((CURRENT + 1))
done

echo "=================================================="
echo "Retry complete!"
echo "Success: $SUCCESS"
echo "Conflicted: $CONFLICTED"
echo "Failed again: $FAILED"
echo "=================================================="
