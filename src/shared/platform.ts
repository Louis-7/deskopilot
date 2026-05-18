export type Platform = 'macos' | 'windows' | 'linux';

export function currentPlatform(): Platform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}
