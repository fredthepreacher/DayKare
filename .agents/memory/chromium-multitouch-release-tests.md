---
name: Chromium multi-touch release tests
description: Testing constraint for independent pointer release in browser smoke coverage.
---

Chromium's raw `Input.dispatchTouchEvent` can drive simultaneous touch pointers, but its `touchEnd` command ends the active touch sequence rather than reliably modeling one finger lifting while another remains.

**Why:** A browser assertion incorrectly reported that releasing the camera-look finger reset movement; the command had ended both synthetic touches.

**How to apply:** Use browser automation for simultaneous two-pointer motion and recenter continuity. Verify partial-release ownership through the same deterministic ownership controller used by the UI rather than treating a CDP `touchEnd` result as real device behavior.