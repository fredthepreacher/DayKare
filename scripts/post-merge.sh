#!/bin/bash
set -e

# Keeps workspace dependencies in sync after a merge.
#
# NOTE: this script used to run `pnpm --filter db push`, which pushed Drizzle
# schema changes to whatever DATABASE_URL happened to be set. That is unsafe
# outside a disposable dev environment and has been removed. Schema pushes are
# now a deliberate, manual step.
pnpm install --frozen-lockfile
