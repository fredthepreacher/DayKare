---
name: Teleport camera test ordering
description: How to preserve intentional camera orientation in browser regressions that reposition the live player.
---

In live DayKare browser regressions, let a player teleport settle before applying and asserting an intentional camera orbit.

**Why:** Teleport and zone-reset handling establishes a fresh third-person shot by recentering the camera on the next player frame. Applying an adverse orbit in the same step is silently overwritten, so a focus regression can pass without exercising the claimed camera angle.

**How to apply:** Reposition and trigger teleport first, wait for the player frame to consume it, then apply the orbit, assert the resulting camera input or direction, and only afterward evaluate interaction focus.