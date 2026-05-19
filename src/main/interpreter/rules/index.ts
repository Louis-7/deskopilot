import type { Rule } from '@shared/types';
import { typingRule } from './typing.rule';
import { aiActivityRule } from './ai-activity.rule';
import { contextRule } from './context.rule';
import { idleRule } from './idle.rule';
// import { networkRule } from './network.rule';  // disabled — re-enable here + in platform/registry.ts

// Order matters only for tiebreaking when multiple rules fire at the same
// tick — the first wins.
export const ALL_RULES: readonly Rule[] = [
  typingRule,
  aiActivityRule,
  contextRule,
  idleRule,
];
