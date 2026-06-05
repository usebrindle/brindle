# Declarative rules label dogfood

Small diff for a throwaway PR: add label **`merge-risk-dogfood-declarative`** on the PR and confirm merge-risk shows **Declarative rule: dogfood_declarative_label** in the breakdown.

**Requires** `.merge-risk.yml` on the PR **base** branch to include `declarative_rules` (merge the declarative dogfood slice to `main` first if you are opening this PR against `main`).

Remove this file after verification.
