---
name: Vite smoke-test module identity
description: Why clean workflow restarts matter before browser checks that dynamically import live application state.
---

Run browser smoke checks that dynamically import live state modules only after a clean Vite workflow restart. Do not use a separately imported stateful registry to assert what the mounted scene registered.

**Why:** After hot updates, Vite may retain timestamped module identities for the mounted app. A later unversioned dynamic import can create a second state-module instance, making automation mutate a store that the rendered UI does not observe. Stateful scene registries can also resolve as separate instances even after a restart.

**How to apply:** Once implementation edits are complete, restart the managed workflow before running the browser harness. Prefer exported pure rules or visible UI effects for cross-module assertions; test registry internals in same-module unit tests.