---
name: Mobile viewport resize ordering
description: Reliable touch-overlay sizing when Chromium device metrics change between mobile viewport shapes.
---

Treat resize and orientation events as an early notification, not proof that `visualViewport` has reached its final dimensions. Recalculate immediately and again after layout, while clamping fixed touch overlays to the current dynamic CSS viewport.

**Why:** Chromium device-metrics changes can update `innerHeight` and the app shell before `visualViewport` listeners expose the new height. Immediate-only logic can leave controls positioned against the previous viewport even though the document has resized.

**How to apply:** For fixed mobile overlays that use `visualViewport`, pair event listeners with a delayed post-layout update and a CSS `100dvh`/`100vw` upper bound. Keep the compact portrait smoke case in the viewport matrix, and make automation assert rectangle separation only after the post-resize layout converges.