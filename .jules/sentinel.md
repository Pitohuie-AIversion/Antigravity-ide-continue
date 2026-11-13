## 2024-11-10 - Path Traversal Vulnerability Fix
**Vulnerability:** Path traversal in `web_server.py` `/preview/` endpoint. The endpoint checked file containment using `target_file.startswith(seagent_dir)`.
**Learning:** `startswith` on paths is vulnerable to prefix collision. If `seagent_dir` is `/home/user/seagent2.1`, a path like `/home/user/seagent2.1-hacked` will incorrectly pass the check.
**Prevention:** Use `os.path.commonpath([base_path_abs, target_path_abs]) == base_path_abs` with `os.path.abspath()` for secure containment checks.
