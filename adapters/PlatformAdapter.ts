import type {
  AutoMergeOutcome,
  MergeMethod,
  PRContext,
  RiskReport,
} from "../core/types.js";

/**
 * Single seam for platform-specific I/O. Core never imports platform SDKs.
 * @see docs/adrs/0007-platform-adapter-boundary.md
 */
export interface PlatformAdapter {
  buildContext(): Promise<PRContext>;
  writeResult(report: RiskReport): Promise<void>;
  enableAutoMerge(method: MergeMethod): Promise<AutoMergeOutcome>;
}
