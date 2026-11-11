## 2024-05-14 - Optimize DOM rendering with DocumentFragment
**Learning:** Frequent DOM manipulations in loops (like appending elements one by one to `fleetGrid` or `consoleBody`) can cause layout thrashing and hurt performance on frequent polling updates.
**Action:** Use `DocumentFragment` to batch DOM insertions when rendering multiple items in vanilla JS loops.
