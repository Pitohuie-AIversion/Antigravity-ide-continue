#!/usr/bin/env python3
import os
import sys
import json
import time

BRAIN = os.path.expanduser("~/.gemini/antigravity-ide/brain")
convs = []

if os.path.exists(BRAIN):
    for entry in os.listdir(BRAIN):
        p = os.path.join(BRAIN, entry, ".system_generated", "logs", "transcript.jsonl")
        if os.path.exists(p):
            mtime = os.path.getmtime(p)
            lines = []
            preview = "🌱 (新建空白会话 · 未发消息)"
            try:
                with open(p, "r", encoding="utf-8", errors="ignore") as f:
                    for l in f:
                        l = l.strip()
                        if l:
                            lines.append(l)
                            if preview.startswith("🌱"):
                                try:
                                    it = json.loads(l)
                                    if it.get("type") == "USER_INPUT" and it.get("content"):
                                        c = str(it["content"]).strip()
                                        if "<USER_REQUEST>" in c:
                                            c = c.split("<USER_REQUEST>")[1].split("</USER_REQUEST>")[0].strip()
                                        preview = c.replace("\n", " ")[:70]
                                except Exception:
                                    pass
            except Exception:
                pass

            step_count = len(lines)
            is_empty = (step_count == 0)
            convs.append({
                "id": entry,
                "mtime": mtime,
                "mtime_str": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime)),
                "preview": preview,
                "step_count": step_count,
                "is_empty": is_empty,
                "is_remote": True
            })

convs.sort(key=lambda x: x["mtime"], reverse=True)
limit = 50
if len(sys.argv) > 1:
    try:
        limit = int(sys.argv[1])
    except Exception:
        pass

print(json.dumps(convs[:limit], ensure_ascii=False))
