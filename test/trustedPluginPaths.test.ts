import { describe, expect, it } from "vitest";

import {
  isNormalizedPathStrictlyInsideDirectory,
  normalizeRepositoryRelativePosixPath,
  validateTrustedPluginsPathsStayUnderDirectory,
} from "../core/plugins/trustedPluginPaths.js";

describe("normalizeRepositoryRelativePosixPath", () => {
  it("trims and collapses segments", () => {
    expect(normalizeRepositoryRelativePosixPath("  foo/bar/../baz  ")).toBe("foo/baz");
  });

  it("accepts backslashes as separators", () => {
    expect(normalizeRepositoryRelativePosixPath("foo\\bar\\baz")).toBe("foo/bar/baz");
  });

  it("returns '.' only for root-relative current", () => {
    expect(normalizeRepositoryRelativePosixPath(".")).toBe(".");
    expect(normalizeRepositoryRelativePosixPath("././")).toBe(".");
  });

  it("rejects empty and whitespace-only", () => {
    expect(normalizeRepositoryRelativePosixPath("")).toBeNull();
    expect(normalizeRepositoryRelativePosixPath("   ")).toBeNull();
  });

  it("rejects absolute POSIX paths", () => {
    expect(normalizeRepositoryRelativePosixPath("/etc/passwd")).toBeNull();
    expect(normalizeRepositoryRelativePosixPath("/foo")).toBeNull();
  });

  it("rejects Windows drive letters", () => {
    expect(normalizeRepositoryRelativePosixPath("C:\\Windows")).toBeNull();
    expect(normalizeRepositoryRelativePosixPath("D:/tmp")).toBeNull();
  });

  it("rejects paths that climb above the repo-relative root", () => {
    expect(normalizeRepositoryRelativePosixPath("../outside")).toBeNull();
    expect(normalizeRepositoryRelativePosixPath("foo/../../outside")).toBeNull();
  });

  it("rejects NUL bytes", () => {
    expect(normalizeRepositoryRelativePosixPath("foo\0/bar")).toBeNull();
  });
});

describe("isNormalizedPathStrictlyInsideDirectory", () => {
  it("returns true for a direct child file", () => {
    expect(
      isNormalizedPathStrictlyInsideDirectory(".merge-risk-plugins", ".merge-risk-plugins/a.yaml"),
    ).toBe(true);
  });

  it("returns false when directory is '.'", () => {
    expect(isNormalizedPathStrictlyInsideDirectory(".", "foo")).toBe(false);
  });

  it("returns false for sibling prefix paths", () => {
    expect(isNormalizedPathStrictlyInsideDirectory("foo", "foobar/baz")).toBe(false);
  });

  it("returns false when candidate equals directory", () => {
    expect(isNormalizedPathStrictlyInsideDirectory("plugins", "plugins")).toBe(false);
  });
});

describe("validateTrustedPluginsPathsStayUnderDirectory", () => {
  it("accepts valid directory and nested plugin paths", () => {
    const result = validateTrustedPluginsPathsStayUnderDirectory({
      directory: ".merge-risk-plugins",
      paths: [".merge-risk-plugins/hello.yaml", ".//.merge-risk-plugins/./deep/x.yml"],
    });
    expect(result).toEqual({
      ok: true,
      normalizedDirectory: ".merge-risk-plugins",
      normalizedPluginPaths: [".merge-risk-plugins/hello.yaml", ".merge-risk-plugins/deep/x.yml"],
    });
  });

  it("rejects directory that normalizes to '.'", () => {
    const result = validateTrustedPluginsPathsStayUnderDirectory({
      directory: ".",
      paths: ["foo.yaml"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("must not resolve to '.'");
    }
  });

  it("rejects plugin path outside directory via ..", () => {
    const result = validateTrustedPluginsPathsStayUnderDirectory({
      directory: ".merge-risk-plugins",
      paths: [".merge-risk-plugins/../evil.yaml"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("must resolve strictly inside");
    }
  });

  it("rejects plugin path that escapes to a sibling directory", () => {
    const result = validateTrustedPluginsPathsStayUnderDirectory({
      directory: "plugins-a",
      paths: ["plugins-b/secret.yaml"],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects non-string directory", () => {
    const result = validateTrustedPluginsPathsStayUnderDirectory({
      directory: 1 as unknown as string,
      paths: [],
    });
    expect(result).toEqual({ ok: false, message: "trusted_plugins.directory must be a string." });
  });

  it("rejects non-array paths", () => {
    const result = validateTrustedPluginsPathsStayUnderDirectory({
      directory: "plugins",
      paths: "x" as unknown as string[],
    });
    expect(result).toEqual({ ok: false, message: "trusted_plugins.paths must be an array." });
  });

  it("rejects non-string path entry", () => {
    const result = validateTrustedPluginsPathsStayUnderDirectory({
      directory: "plugins",
      paths: [null as unknown as string],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("paths[0]");
    }
  });
});
