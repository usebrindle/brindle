import type {
  AutoMergeOutcome,
  MergeMethod,
  PRContext,
  RiskReport,
} from "../core/types.js";

/**
 * Single seam for platform-specific I/O. Core never imports platform SDKs.
 *
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
export interface PlatformAdapter {
  /** Load base-branch config and change metadata into a neutral {@link PRContext}. */
  buildContext(): Promise<PRContext>;
  /** Publish a {@link RiskReport} to the platform (e.g. check run, comment). */
  writeResult(report: RiskReport): Promise<void>;
  /** Turn on native auto-merge when policy allows; never call the merge API directly. */
  enableAutoMerge(method: MergeMethod): Promise<AutoMergeOutcome>;
}
