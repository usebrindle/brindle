/**
 * Maps GitHub pull request snapshots into {@link PRContext}. Pure: no I/O.
 *
 * @see docs/adrs/0004-pure-criteria-over-hydrated-context.md
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
import type { ChangedFile, CoverageReport, PRContext } from "../../core/types.js";

import type { GitHubPullFileSnapshot, GitHubPullSnapshot } from "./githubAdapter.types.js";

const changedFilesFromSnapshots = (fileSnapshots: GitHubPullFileSnapshot[]): ChangedFile[] =>
  fileSnapshots.map((fileSnapshot) => ({
    path: fileSnapshot.path,
    status: fileSnapshot.status,
    additions: fileSnapshot.additions,
    deletions: fileSnapshot.deletions,
  }));

const sumAdditions = (changedFiles: ChangedFile[]): number =>
  changedFiles.reduce((runningTotal, file) => runningTotal + file.additions, 0);

const sumDeletions = (changedFiles: ChangedFile[]): number =>
  changedFiles.reduce((runningTotal, file) => runningTotal + file.deletions, 0);

/**
 * @param repositoryOwner - GitHub org or user login owning the repo.
 * @param repositoryName - Repository name without owner.
 * @param pullRequestNumber - GitHub pull request number.
 * @param pullSnapshot - Fields read from the pull request resource.
 * @param fileSnapshots - Rows from the pull request files listing (caller paginates).
 */
export const mapGitHubPullAndFilesToPRContext = (
  repositoryOwner: string,
  repositoryName: string,
  pullRequestNumber: number,
  pullSnapshot: GitHubPullSnapshot,
  fileSnapshots: GitHubPullFileSnapshot[],
  coverageReport?: CoverageReport,
): PRContext => {
  const changedFiles = changedFilesFromSnapshots(fileSnapshots);
  return {
    repoSlug: `${repositoryOwner}/${repositoryName}`,
    changeNumber: pullRequestNumber,
    headSha: pullSnapshot.headSha,
    baseRef: pullSnapshot.baseRefName,
    author: pullSnapshot.authorLogin,
    title: pullSnapshot.title,
    body: pullSnapshot.body,
    labels: pullSnapshot.labelNames,
    createdAt: pullSnapshot.createdAtIso,
    files: changedFiles,
    totalAdditions: sumAdditions(changedFiles),
    totalDeletions: sumDeletions(changedFiles),
    ...(coverageReport === undefined ? {} : { coverage: coverageReport }),
  };
};
