import { describe, expect, it } from "vitest";

import type { ContextualCharacterization, FileChangeKind } from "../core/contextual/index.js";
import type {
  ContextualCharacterization as CoreBarrelCharacterization,
  FileChangeKind as CoreBarrelFileChangeKind,
} from "../core/index.js";

describe("core/contextual scaffolding", () => {
  it("exports shared characterization and change-kind types from the contextual barrel", () => {
    const characterization: ContextualCharacterization = "moderate";
    const changeKind: FileChangeKind = "added";
    expect(characterization).toBe("moderate");
    expect(changeKind).toBe("added");
  });

  it("re-exports contextual types from core/index without breaking the public barrel", () => {
    const fromCoreBarrel: CoreBarrelCharacterization = "none";
    const changeKindFromCore: CoreBarrelFileChangeKind = "modified";
    expect(fromCoreBarrel).toBe("none");
    expect(changeKindFromCore).toBe("modified");
  });
});
