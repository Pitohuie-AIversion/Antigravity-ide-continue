#!/usr/bin/env python3
import os
import sys
import json
import glob

is_transcript_mode = False
limit = 10

args = sys.argv[1:]
if args and args[0] == "--transcript":
    is_transcript_mode = True
    args = args[1:]

if not args:
    print(json.dumps({"error": "Missing conversation_id"}))
    sys.exit(1)

conv_id = args[0].strip()
if len(args) > 1:
    try:
        limit = int(args[1])
    except Exception:
        pass

brain_dir = os.path.expanduser("~/.gemini/antigravity-ide/brain")
target_dir = os.path.join(brain_dir, conv_id)

if not os.path.exists(target_dir):
    matches = glob.glob(os.path.join(brain_dir, conv_id + "*"))
    if matches:
        target_dir = matches[0]

transcript_path = os.path.join(target_dir, ".system_generated", "logs", "transcript.jsonl")

if not os.path.exists(transcript_path):
    print(json.dumps({"error": "Transcript not found", "step_index": -1, "is_turn_complete": False, "steps": []}))
    sys.exit(0)

lines = []
try:
    with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
        for line in f:
            l = line.strip()
            if l:
                lines.append(l)
except Exception as e:
    print(json.dumps({"error": str(e), "step_index": -1, "is_turn_complete": False, "steps": []}))
    sys.exit(0)

if not lines:
    if is_transcript_mode:
        print(json.dumps({"steps": []}, ensure_ascii=False))
    else:
        print(json.dumps({"step_index": 0, "total_steps": 0, "is_turn_complete": False, "snippet": "空会话"}))
    sys.exit(0)

total_steps = len(lines)

# Transcript Mode
if is_transcript_mode:
    steps = []
    for line in lines[-limit:]:
        try:
            step = json.loads(line)
            content = str(step.get("content", "")).strip()
            if "<USER_REQUEST>" in content:
                content = content.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
            tool_names = [t.get("name") or t.get("tool") or "tool" for t in step.get("tool_calls", []) if isinstance(t, dict)]
            steps.append({
                "step_index": step.get("step_index", -1),
                "type": step.get("type", ""),
                "source": step.get("source", ""),
                "status": step.get("status", ""),
                "tool_calls": tool_names,
                "content": content[:600] if len(content) > 600 else content,
            })
        except Exception:
            continue
    print(json.dumps({"steps": steps}, ensure_ascii=False))
    sys.exit(0)

# Status Mode
last_step = None
for l in reversed(lines[-5:]):
    try:
        last_step = json.loads(l)
        break
    except Exception:
        continue

if not last_step:
    print(json.dumps({"error": "No valid JSON step", "step_index": total_steps, "is_turn_complete": False}))
    sys.exit(0)

step_index = last_step.get("step_index", total_steps)
step_type = last_step.get("type", "")
source = last_step.get("source", "")
status = last_step.get("status", "")
tool_calls = last_step.get("tool_calls", [])
content = str(last_step.get("content", "")).strip()

is_turn_complete = (step_type == "PLANNER_RESPONSE" and status == "DONE" and len(tool_calls) == 0)
snippet = content[:80].replace("\n", " ") if content else (step_type or "处理中")

print(json.dumps({
    "step_index": step_index,
    "total_steps": total_steps,
    "step_type": step_type,
    "status": status,
    "source": source,
    "is_turn_complete": is_turn_complete,
    "snippet": snippet
}, ensure_ascii=False))
