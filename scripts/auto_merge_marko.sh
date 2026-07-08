#!/bin/bash

# Configuration
REMOTE="marko1olo"
LIMIT=1000
LOG_DIR="merge_logs"
SUCCESS_LOG="$LOG_DIR/merged_successfully.txt"
CONFLICT_LOG="$LOG_DIR/conflicted.txt"
FAILED_LOG="$LOG_DIR/failed_tests.txt"

mkdir -p "$LOG_DIR"
echo "" > "$SUCCESS_LOG"
echo "" > "$CONFLICT_LOG"
echo "" > "$FAILED_LOG"

echo "Fetching remote $REMOTE..."
git fetch $REMOTE

# Get unmerged branches
git branch -r --no-merged main | grep "$REMOTE/" | awk '{print $1}' > "$LOG_DIR/unmerged.txt"

# Get sorted marko branches (newest first)
git for-each-ref --sort=-committerdate refs/remotes/$REMOTE --format='%(refname:short)' > "$LOG_DIR/sorted.txt"

# Intersect while preserving sorted order
BRANCHES=$(grep -Fxf "$LOG_DIR/unmerged.txt" "$LOG_DIR/sorted.txt" | head -n $LIMIT)

TOTAL=$(echo "$BRANCHES" | wc -w | awk '{print $1}')
echo "Found $TOTAL unmerged branches to evaluate (limited to latest $LIMIT)."

COUNT=0
for branch in $BRANCHES; do
    COUNT=$((COUNT+1))
    echo "=================================================="
    echo "Processing branch $COUNT of $TOTAL: $branch"
    echo "=================================================="

    # Verify we are on main
    git checkout main

    # Try merging
    git merge --no-edit "$branch"
    MERGE_STATUS=$?

    if [ $MERGE_STATUS -ne 0 ]; then
        echo "Conflict detected on $branch. Aborting merge."
        git merge --abort
        echo "$branch" >> "$CONFLICT_LOG"
        continue
    fi

    echo "Merge successful. Running validation tests..."
    # Suppress most output but keep errors
    npm run check:readonly > "$LOG_DIR/current_test.log" 2>&1
    TEST_STATUS=$?

    if [ $TEST_STATUS -ne 0 ]; then
        echo "Tests failed for $branch. Reverting merge."
        git reset --hard HEAD~1
        echo "$branch" >> "$FAILED_LOG"
        # Save the log for manual review
        cp "$LOG_DIR/current_test.log" "$LOG_DIR/failed_$(basename $branch).log"
    else
        echo "Tests passed for $branch. Keeping merge."
        echo "$branch" >> "$SUCCESS_LOG"
    fi
done

echo "=================================================="
echo "Automation complete!"
echo "Merged successfully: $(grep -v '^$' $SUCCESS_LOG | wc -l | awk '{print $1}') branches"
echo "Conflicted: $(grep -v '^$' $CONFLICT_LOG | wc -l | awk '{print $1}') branches"
echo "Failed tests: $(grep -v '^$' $FAILED_LOG | wc -l | awk '{print $1}') branches"
echo "Check the $LOG_DIR directory for details."
