# Trusted plugins verify PR

This branch exists only to open a pull request and **manually** confirm merge-risk scoring with **`trusted_plugins`** (see **`.merge-risk.yml`** and **`.merge-risk-plugins/dogfood-labels.yaml`** on the PR **base** branch).

## What to do

1. Open a PR from **`dogfood/trusted-plugins-verify`** into your integration branch (usually **`main`**), after that branch already contains the trusted-plugins implementation and dogfood config.
2. On the PR, add label **`merge-risk-dogfood-trusted-plugin`**.
3. Wait for the merge-risk workflow; in the comment/check breakdown, confirm a row like **Trusted plugin: .merge-risk-plugins/dogfood-labels.yaml** with a non-zero contribution when the label matches (MVP **`labels_any`** / **`score`**).

## Cleanup

Close or merge the verify PR when done; you can delete this branch afterward.
