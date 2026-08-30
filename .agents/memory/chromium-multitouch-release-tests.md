---
name: Chromium multi-touch release tests
description: Testing constraints for multi-touch delivery and independent pointer release in browser smoke coverage.
---

Chromium's raw `Input.dispatchTouchEvent` can drive simultaneous touch pointers, but its `touchEnd` command ends the active touch sequence rather than reliably modeling one finger lifting while another remains.

**Why:** A browser assertion incorrectly reported that releasing the camera-look finger reset movement; the command had ended both synthetic touches.

**How to apply:** Use browser automation for simultaneous two-pointer motion and recenter continuity. Verify partial-release ownership through the same deterministic ownership controller used by the UI rather than treating a CDP `touchEnd` result as real device behavior.

In software-rendered Chromium, a `touchMove` sent immediately after `touchStart` can also arrive before the page has claimed the pointer, especially around viewport rotation or scene transitions.

**Why:** Single-frame assertions intermittently saw a centered joystick even though the same sequence passed once the pointer-down event had time to settle.

**How to apply:** Leave a short settling interval after each CDP `touchStart`, wait for real transition curtains to finish, and use deterministic controller tests for ownership combinations that CDP cannot preserve reliably.