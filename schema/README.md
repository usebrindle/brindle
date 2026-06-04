# Merge-risk JSON Schema

This directory holds the subset JSON Schema for `.merge-risk.yml` consumed by Brindle.

This file exists only on a throwaway smoke branch so the pull request touches `schema/**`, which matches the **`merge_risk_schema`** service in the repo’s dogfood `services` map. That should drive **Service criticality** in the merge-risk comment (configured score **28** when this path matches). Delete this file before merging anything to `main` if you do not want it.
