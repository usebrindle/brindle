# Merge-risk dogfood test PR

Trivial change so you can open a pull request whose **base** branch already carries `.merge-risk.yml` with `author_seniority` enabled.

**Suggested PR:** compare `test/author-seniority-dogfood-pr` → base **`slice/author-seniority-dogfood-lld`** (until that slice merges to `main`). Brindle reads config from the PR base ref, so the dogfood criteria run on this PR’s checks.

Remove this file after validation if you do not want it on `main` long term.
