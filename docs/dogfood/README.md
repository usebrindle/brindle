# Dogfooding Brindle

This repository runs merge-risk scoring on its own pull requests using committed configuration (see [`.merge-risk.yml`](../../.merge-risk.yml) and [`.merge-risk-plugins/`](../../.merge-risk-plugins/)).

**Canonical description** of what is enabled in this repo (criteria, mutators, declarative rules, trusted plugins, labels, and path dogfood) lives in one place: the **Dogfood** bullet under [Brindle repository snapshot (this spec vs shipped code)](../designs/lld-merge-risk-classifier.md#brindle-repository-snapshot-this-spec-vs-shipped-code) in the low-level design doc. Use that section as the source of truth; do not restate it here.
