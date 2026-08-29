---
name: WebGL preview validation
description: How to interpret automated preview failures for DayKare's React Three Fiber scene.
---

Automated screenshot sessions may fail to create a WebGL context for DayKare even when the application is otherwise healthy.

**Why:** The capture browser has repeatedly reported `THREE.WebGLRenderer: Error creating WebGL context` while the managed Vite workflow starts cleanly, the production build succeeds, and TypeScript passes. This is a limitation of the automated capture environment rather than evidence of a source-code regression.

**How to apply:** Use typechecking, production builds, clean workflow startup, and browser-log inspection as the automated baseline. Treat the screenshot tool as useful for validating HTML HUD and responsive overlays, but verify the rendered 3D scene and animation in a WebGL-capable preview/device. In SwiftShader smoke tests, take the frame-budget sample before briefly mounting deferred 3D zones; scene allocation and disposal can temporarily depress the sample even after returning to the Hub.