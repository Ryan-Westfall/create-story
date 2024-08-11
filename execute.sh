#!/bin/bash

# Set the PATH environment variable
export PATH="/Users/ryrywest/.rbenv/shims:/Users/ryrywest/.nvm/versions/node/v18.6.0/bin:/usr/local/bin:/System/Cryptexes/App/usr/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/local/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/bin:/var/run/com.apple.security.cryptexd/codex.system/bootstrap/usr/appleinternal/bin:/Users/ryrywest/.toolbox/bin"

# Change directory to the project folder
cd /Users/ryrywest/Documents/SereneBean/create-story

# Define the command to run
COMMAND="/Users/ryrywest/.nvm/versions/node/v18.6.0/bin/npx tsx annotate.ts"

# Set maximum number of retries
MAX_RETRIES=3
RETRY_COUNT=0

# Run the command in a loop, retrying if it fails
while true; do
    # Execute the command
    $COMMAND
    EXIT_STATUS=$?

    if [ $EXIT_STATUS -eq 0 ]; then
        echo "Command succeeded."
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        echo "Command failed with exit status $EXIT_STATUS. Retry $RETRY_COUNT of $MAX_RETRIES..."

        if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
            echo "Reached maximum retry limit. Exiting."
            break
        fi

        # Wait before retrying
        sleep 5
    fi
done
