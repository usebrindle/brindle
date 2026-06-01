import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { IstanbulCoverageParseError, parseIstanbulCoverageJson } from "../core/coverage/istanbul.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "istanbul-coverage-minimal.json");

describe("parseIstanbulCoverageJson", () => {
  it("aggregates statement hits from a coverage-final fixture", async () => {
    const jsonText = await readFile(fixturePath, "utf8");
    const report = parseIstanbulCoverageJson(jsonText);
    expect(report.linesCovered).toBe(1);
    expect(report.linesTotal).toBe(2);
  });

  it("throws IstanbulCoverageParseError on invalid JSON", () => {
    expect(() => parseIstanbulCoverageJson("{")).toThrow(IstanbulCoverageParseError);
  });

  it("throws when the root is not an object", () => {
    expect(() => parseIstanbulCoverageJson("[]")).toThrow(IstanbulCoverageParseError);
  });

  it("throws when there are no statement counters", () => {
    expect(() => parseIstanbulCoverageJson("{}")).toThrow(/no statement counters/);
  });
});
