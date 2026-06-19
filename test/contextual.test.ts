import { describe, expect, it } from "vitest";

import {
  deserializeContextualEvidenceSnapshot,
  deserializeFamiliarityFinding,
  isBlastRadiusFinding,
  isContextualEvidenceSnapshot,
  isFamiliarityFinding,
  serializeContextualEvidenceSnapshot,
  serializeFamiliarityFinding,
} from "../core/contextual/index.js";
import type {
  BlastRadiusFinding,
  ContextualEvidenceSnapshot,
  FamiliarityFinding,
} from "../core/contextual/index.js";
import type {
  BlastRadiusCharacterization,
  ContextualCharacterization,
  ContextualEvidenceSnapshot as CoreBarrelSnapshot,
  FamiliarityFinding as CoreBarrelFamiliarityFinding,
  FileChangeKind,
  FileChangeKind as CoreBarrelFileChangeKind,
  NotAnalyzedForBlastRadius,
} from "../core/index.js";

const sampleFamiliarityFinding = (): FamiliarityFinding => ({
  touchedFile: "src/auth.ts",
  changeKind: "modified",
  authorOwnedLineCount: 12,
  totalBlameableLineCount: 40,
  shareOfCurrentContent: 0.3,
  authorChangedLineCount: 5,
  totalChangedLineCount: 20,
  shareOfWindowedLineChurn: 0.25,
  authorCommitCount: 3,
  totalFileCommitCount: 10,
  lastTouchDate: new Date("2026-01-15T12:00:00.000Z"),
  shareOfFileCommitChurn: 0.3,
  characterization: "high",
});

const sampleBlastRadiusFinding = (): BlastRadiusFinding => ({
  changedFile: "src/schema.ts",
  directDependentCount: 1,
  directDependents: ["src/api.ts"],
  transitiveReachCount: 52,
  characterization: "broad",
});

const sampleContextualEvidenceSnapshot = (): ContextualEvidenceSnapshot => ({
  familiarityFindings: [sampleFamiliarityFinding()],
  blastRadiusFindings: [sampleBlastRadiusFinding()],
  notAnalyzedForBlastRadius: [{ path: "README.md", reason: "no extractor for extension .md" }],
  limitations: ["Static imports only"],
  enabledExtractors: ["js_ts", "stylesheet"],
});

describe("core/contextual types", () => {
  it("exports shared characterization and change-kind types from the contextual barrel", () => {
    const characterization = "moderate" satisfies ContextualCharacterization;
    const changeKind = "added" satisfies FileChangeKind;
    const characterizations: readonly ContextualCharacterization[] = ["high", "moderate", "none"];
    const changeKinds: readonly FileChangeKind[] = ["added", "modified"];
    expect(characterizations).toContain(characterization);
    expect(changeKinds).toContain(changeKind);
  });

  it("re-exports contextual types from core/index without breaking the public barrel", () => {
    const fromCoreBarrel = "none" satisfies ContextualCharacterization;
    const changeKindFromCore = "modified" satisfies CoreBarrelFileChangeKind;
    const snapshotFromCore: CoreBarrelSnapshot = sampleContextualEvidenceSnapshot();
    const familiarityFromCore: CoreBarrelFamiliarityFinding = sampleFamiliarityFinding();
    expect(fromCoreBarrel).toBe("none");
    expect(changeKindFromCore).toBe("modified");
    expect(snapshotFromCore.enabledExtractors).toEqual(["js_ts", "stylesheet"]);
    expect(familiarityFromCore.touchedFile).toBe("src/auth.ts");
  });

  it("accepts blast-radius characterization tiers", () => {
    const characterization = "isolated" satisfies BlastRadiusCharacterization;
    const characterizations: readonly BlastRadiusCharacterization[] = ["isolated", "moderate", "broad"];
    expect(characterizations).toContain(characterization);
  });

  it("models not-analyzed blast-radius entries with path and reason", () => {
    const entry: NotAnalyzedForBlastRadius = {
      path: "pkg/main.go",
      reason: "extractor disabled: go",
    };
    expect(entry.reason).toContain("go");
  });
});

describe("contextual evidence type guards", () => {
  it("accepts valid familiarity and blast-radius findings", () => {
    expect(isFamiliarityFinding(sampleFamiliarityFinding())).toBe(true);
    expect(isBlastRadiusFinding(sampleBlastRadiusFinding())).toBe(true);
    expect(isContextualEvidenceSnapshot(sampleContextualEvidenceSnapshot())).toBe(true);
  });

  it("rejects invalid familiarity finding shapes", () => {
    expect(isFamiliarityFinding(null)).toBe(false);
    expect(isFamiliarityFinding({ ...sampleFamiliarityFinding(), characterization: "broad" })).toBe(false);
    expect(isFamiliarityFinding({ ...sampleFamiliarityFinding(), lastTouchDate: "2026-01-01" })).toBe(false);
    expect(isFamiliarityFinding({ ...sampleFamiliarityFinding(), changeKind: "renamed" })).toBe(false);
  });

  it("rejects invalid blast-radius and snapshot shapes", () => {
    expect(isBlastRadiusFinding({ ...sampleBlastRadiusFinding(), directDependents: ["ok", 1] })).toBe(false);
    expect(isContextualEvidenceSnapshot({ ...sampleContextualEvidenceSnapshot(), limitations: "x" })).toBe(false);
    expect(
      isContextualEvidenceSnapshot({
        ...sampleContextualEvidenceSnapshot(),
        notAnalyzedForBlastRadius: [{ path: "a.go", reason: 1 }],
      }),
    ).toBe(false);
  });

  it("accepts added-file greenfield familiarity with null last touch", () => {
    const added: FamiliarityFinding = {
      ...sampleFamiliarityFinding(),
      touchedFile: "src/new.ts",
      changeKind: "added",
      authorOwnedLineCount: 0,
      totalBlameableLineCount: 0,
      shareOfCurrentContent: 0,
      authorChangedLineCount: 0,
      totalChangedLineCount: 0,
      shareOfWindowedLineChurn: 0,
      authorCommitCount: 0,
      totalFileCommitCount: 0,
      lastTouchDate: null,
      shareOfFileCommitChurn: 0,
      characterization: "high",
    };
    expect(isFamiliarityFinding(added)).toBe(true);
  });
});

describe("contextual evidence serialization", () => {
  it("round-trips familiarity lastTouchDate through ISO strings", () => {
    const finding = sampleFamiliarityFinding();
    const serialized = serializeFamiliarityFinding(finding);
    expect(serialized.lastTouchDate).toBe("2026-01-15T12:00:00.000Z");
    const restored = deserializeFamiliarityFinding(serialized);
    expect(restored.lastTouchDate?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
    expect(isFamiliarityFinding(restored)).toBe(true);
  });

  it("serializes null lastTouchDate for greenfield adds", () => {
    const serialized = serializeFamiliarityFinding({
      ...sampleFamiliarityFinding(),
      changeKind: "added",
      lastTouchDate: null,
      characterization: "high",
    });
    expect(serialized.lastTouchDate).toBeNull();
  });

  it("round-trips a full contextual evidence snapshot", () => {
    const snapshot = sampleContextualEvidenceSnapshot();
    const serialized = serializeContextualEvidenceSnapshot(snapshot);
    const jsonRoundTrip = JSON.parse(JSON.stringify(serialized)) as unknown;
    const restored = deserializeContextualEvidenceSnapshot(jsonRoundTrip);
    expect(restored).not.toBeNull();
    expect(restored?.familiarityFindings[0]?.lastTouchDate).toBeInstanceOf(Date);
    expect(isContextualEvidenceSnapshot(restored)).toBe(true);
  });

  it("returns null when deserializing invalid snapshot input", () => {
    expect(deserializeContextualEvidenceSnapshot(null)).toBeNull();
    expect(deserializeContextualEvidenceSnapshot({ familiarityFindings: "bad" })).toBeNull();
  });
});
