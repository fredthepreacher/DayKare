---
name: Vite smoke-test module identity
description: Why clean workflow restarts matter before browser checks that dynamically import live application state.
---

Run browser smoke checks that dynamically import live state modules only after a clean Vite workflow restart.

**Why:** After hot updates, Vite may retain timestamped module identities for the mounted app. A later unversioned dynamic import can create a second state-module instance, making automation mutate a store that the rendered UI does not observe.

**How to apply:** Once implementation edits are complete, restart the managed workflow before running the browser harness. Treat a state/UI mismatch after HMR as a module-identity problem until it reproduces after a clean restart.