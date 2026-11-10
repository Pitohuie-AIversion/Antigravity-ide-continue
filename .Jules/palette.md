## 2024-05-24 - Missing ARIA Labels on Icon-only Buttons
**Learning:** Found multiple icon-only "close" (✕) buttons in modals and search bars throughout `web/index.html` that lack screen reader context, making it impossible for screen reader users to understand their function.
**Action:** Always verify that buttons containing only icons or visual symbols include descriptive `aria-label` attributes (e.g., `aria-label="关闭窗口"` or `aria-label="清空搜索"`).
