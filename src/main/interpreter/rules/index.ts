import type { Rule } from '@shared/types';
import { typingRule } from './typing.rule';
import { aiActivityRule } from './ai-activity.rule';
import { networkRule } from './network.rule';
import { contextRule } from './context.rule';
import { idleRule } from './idle.rule';

// Order matters only for tiebreaking when multiple rules fire at the same
// tick — the first wins. We prioritize signals that are most "salient": an
// AI agent crunching is more interesting than the user mid-keystroke, etc.
export const ALL_RULES: readonly Rule[] = [
  aiActivityRule,
  typingRule,
  networkRule,
  contextRule,
  idleRule,
];
