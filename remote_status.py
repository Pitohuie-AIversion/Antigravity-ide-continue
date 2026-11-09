#!/usr/bin/env python3
import os
import sys
import json

if len(sys.argv) < 2:
    print(json.dumps({"error": "Missing conversation_id"}))
    sys.exit(1)

conv_id = sys.argv[1]
brain_dir = os.path.expanduser("~/.gemini/antigravity-ide/brain")
transcript_path = os.path.join(brain_dir, conv_id, ".system_generated", "logs", "transcript.jsonl")

if not os.path.exists(transcript_path):
    print(json.dumps({"error": "Transcript not found", "step_index": -1, "is_turn_complete": False}))
    sys.exit(0)

last_line = None
total_steps = 0

try:
    with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            line = line.strip()
            if line:
                last_line = line
                total_steps += 1
except Exception as e:
    print(json.dumps({"error": str(e), "step_index": -1, "is_turn_complete": False}))
    sys.exit(0)

if not last_line:
    print(json.dumps({"step_index": 0, "total_steps": 0, "is_turn_complete": False, "snippet": "空会话"}))
    sys.exit(0)

try:
    item = json.loads(last_line)
    step_index = item.get("step_index", total_steps)
    step_type = item.get("type", "")
    source = item.get("source", "")
    tool_calls = item.get("tool_calls", [])
    content = str(item.get("content", "")).strip()

    is_turn_complete = False
    # If PLANNER_RESPONSE with no active tool calls, the model turn is finished
    if step_type == "PLANNER_RESPONSE" and not tool_calls:
        is_turn_complete = True

    snippet = content[:80].replace("\n", " ") if content else (step_type or "处理中")

    print(json.dumps({
        "step_index": step_index,
        "total_steps": total_steps,
        "step_type": step_type,
        "source": source,
        "is_turn_complete": is_turn_complete,
        "snippet": snippet
    }, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e), "step_index": total_steps, "is_turn_complete": False}))
