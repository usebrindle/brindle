import { describe, expect, it } from "vitest";

import { BRINDLE_VERSION } from "../core/index.js";

describe("brindle", () => {
  it("exports a semver-shaped version string", () => {
    expect(BRINDLE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
