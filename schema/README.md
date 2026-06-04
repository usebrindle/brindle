# schema

This directory holds the JSON Schema Brindle uses to validate `.merge-risk.yml` scoring config.

The root **`.merge-risk.yml`** dogfood config treats changes under **`schema/**`** as a slightly higher-risk signal so merge-risk runs on this repo’s pull requests exercise **`file_patterns`** in CI (see `criteria.file_patterns.options.patterns` there).
