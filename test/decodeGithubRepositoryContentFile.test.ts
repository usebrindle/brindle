import { describe, expect, it } from "vitest";

import { decodeGithubRepositoryContentFile } from "../adapters/github/decodeGithubRepositoryContentFile.js";

describe("decodeGithubRepositoryContentFile", () => {
  it("decodes a base64-encoded file payload", () => {
    const plain = "merge-risk";
    const data = {
      type: "file",
      encoding: "base64",
      content: Buffer.from(plain, "utf8").toString("base64"),
    };
    expect(decodeGithubRepositoryContentFile(data, ".merge-risk.yml")).toBe(plain);
  });

  it("throws when the payload is a directory listing", () => {
    expect(() => decodeGithubRepositoryContentFile([], "dir")).toThrow(/directory/);
  });

  it("throws when type is not file", () => {
    expect(() =>
      decodeGithubRepositoryContentFile({ type: "symlink", target: "x" }, "link"),
    ).toThrow(/not a file/);
  });
});
