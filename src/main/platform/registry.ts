import { currentPlatform } from '@shared/platform';
import type { EventSource } from './source';
import { MockKeyboardSource } from './mock/keyboard.mock';
import { KeyboardSourceMacOS } from './macos/keyboard.macos';
import { FrontmostSourceMacOS } from './macos/frontmost.macos';
import { AiAgentSourceMacOS } from './macos/ai-agent.macos';
import { NetworkSourceMacOS } from './macos/network.macos';

/**
 * Returns the event sources active for the current platform.
 *
 *   DESKOPILOT_MOCK_SOURCES=1  →  use the mock keyboard only (no OS perms)
 *   default                    →  real platform sources
 */
export function getEventSources(): EventSource[] {
  if (process.env['DESKOPILOT_MOCK_SOURCES'] === '1') {
    return [new MockKeyboardSource()];
  }
  const platform = currentPlatform();
  if (platform === 'macos') {
    return [
      new KeyboardSourceMacOS(),
      new FrontmostSourceMacOS(),
      new AiAgentSourceMacOS(),
      new NetworkSourceMacOS(),
    ];
  }
  if (platform === 'windows') {
    // M5+: Windows implementations land here.
    return [];
  }
  return [];
}
