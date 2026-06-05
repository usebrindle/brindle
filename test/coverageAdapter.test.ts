/**
 * @see docs/designs/lld-merge-risk-classifier.md
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseCoverageArtifactText } from "../core/coverage/adapter.js";
import { IstanbulCoverageParseError, parseIstanbulCoverageJson } from "../core/coverage/istanbul.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "istanbul-coverage-minimal.json");

describe("parseCoverageArtifactText", () => {
  it("delegates istanbul format to the Istanbul parser", async () => {
    const jsonText = await readFile(fixturePath, "utf8");
    expect(parseCoverageArtifactText({ format: "istanbul", text: jsonText })).toEqual(
      parseIstanbulCoverageJson(jsonText),
    );
  });

  it("propagates IstanbulCoverageParseError for invalid JSON", () => {
    expect(() => parseCoverageArtifactText({ format: "istanbul", text: "{" })).toThrow(IstanbulCoverageParseError);
  });
});
