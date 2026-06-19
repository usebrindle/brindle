/**
 * Built-in dependency extractors registered for merge-risk-core v1.
 *
 * @see docs/designs/lld-dependency-graph-extractors.md
 */
import { createExtractorRegistry } from "./registry.js";
import { goExtractor } from "./goExtractor.js";
import { jsTsExtractor } from "./jsTsExtractor.js";
import { pythonExtractor } from "./pythonExtractor.js";
import { rustExtractor } from "./rustExtractor.js";
import { stylesheetExtractor } from "./stylesheetExtractor.js";
import type { DependencyExtractor } from "./types.js";

/** v1 built-in extractors; v2 adds go, python, and rust. */
export const builtInExtractors: readonly DependencyExtractor[] = [
  jsTsExtractor,
  stylesheetExtractor,
  goExtractor,
  pythonExtractor,
  rustExtractor,
];

/** Default registry with all v1 built-in extractors. */
export const defaultExtractorRegistry = createExtractorRegistry(builtInExtractors);
