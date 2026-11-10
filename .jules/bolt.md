## 2024-05-18 - [Watcher Transcript Read]
**Learning:** The `read_tail_steps` method in `watcher.py` uses `readlines()` to read the entire transcript file into memory just to get the last `n` lines. This file can grow quite large (thousands of lines of JSON). We can use `collections.deque` to only keep the last `n` lines in memory while iterating, or even better, read from the end of the file.
**Action:** Optimize `read_tail_steps` using `collections.deque` for O(1) memory usage (bounded by `n`) and faster execution time.
