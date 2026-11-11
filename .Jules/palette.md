## 2026-11-11 - [Accessibility] Missing ARIA Labels on Icon-Only Buttons
**Learning:** Icon-only buttons without proper ARIA labels are a recurring accessibility issue in this codebase, impacting screen reader users who rely on textual context to understand button functionality.
**Action:** Always add descriptive `aria-label` attributes to icon-only buttons (`#clearSearchBtn`, `#clearLogSearchBtn`, `.modal-close-btn`, etc.) and ensure dynamic elements (e.g., generated via JS) also include proper accessibility tags.
