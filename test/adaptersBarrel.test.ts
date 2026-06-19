import { describe, expect, it } from "vitest";

import * as adapters from "../adapters/index.js";

describe("adapters index barrel", () => {
  it("re-exports GitHub adapter runtime entrypoints", () => {
    expect(adapters.GitHubAdapter).toBeDefined();
    expect(adapters.createOctokitGithubApiClient).toBeDefined();
    expect(adapters.mapGitHubPullAndFilesToPRContext).toBeDefined();
    expect(adapters.hydrateDependencyGraph).toBeDefined();
  });
});
