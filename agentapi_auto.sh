#!/bin/bash
# Antigravity Language Server AgentAPI Auto-Discovery Wrapper for Linux Remote SSH
PID=$(pgrep -f "language_server_linux_x64" | head -n 1)
if [ -z "$PID" ]; then
    echo '{"error": "No running language_server_linux_x64 found on remote host"}' >&2
    exit 1
fi

TOKEN=$(cat /proc/$PID/cmdline | tr '\0' '\n' | grep -A 1 "^--csrf_token" | tail -n 1)

SOCKS=$(ls -l /proc/$PID/fd 2>/dev/null | grep 'socket:\[' | sed -e 's/.*socket:\[//' -e 's/\].*//')

PORT=""
for INODE in $SOCKS; do
    HEX_PORT=$(awk -v inode="$INODE" '$10 == inode && $4 == "0A" {split($2, a, ":"); print a[2]}' /proc/net/tcp)
    if [ -n "$HEX_PORT" ]; then
        DEC_PORT=$((16#$HEX_PORT))
        OUT=$(ANTIGRAVITY_LS_ADDRESS=127.0.0.1:$DEC_PORT ANTIGRAVITY_CSRF_TOKEN=$TOKEN /root/.gemini/antigravity-ide/bin/agentapi get-conversation-metadata test 2>&1)
        if echo "$OUT" | grep -qv 'missing CSRF token\|connection reset\|connection refused'; then
            PORT=$DEC_PORT
            break
        fi
    fi
done

if [ -z "$PORT" ]; then
    for INODE in $SOCKS; do
        HEX_PORT=$(awk -v inode="$INODE" '$10 == inode && $4 == "0A" {split($2, a, ":"); print a[2]}' /proc/net/tcp)
        if [ -n "$HEX_PORT" ]; then
            PORT=$((16#$HEX_PORT))
            break
        fi
    done
fi

LS_BIN=$(ls -d /root/.antigravity-ide-server/bin/*/extensions/antigravity/bin/language_server_linux_x64 2>/dev/null | head -n 1)
if [ -z "$LS_BIN" ]; then
    LS_BIN="/root/.gemini/antigravity-ide/bin/agentapi"
fi

ANTIGRAVITY_LS_ADDRESS="127.0.0.1:$PORT" ANTIGRAVITY_CSRF_TOKEN="$TOKEN" "$LS_BIN" agentapi "$@"
