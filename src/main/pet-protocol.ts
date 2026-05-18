import { net, protocol } from 'electron';
import { existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { builtinPetsDir, userPetsDir } from './pets/registry';

const SCHEME = 'pet';

// Renderer requests look like:  pet://<pet-id>/<filename>
// Resolution order:
//   1. <userData>/pets/<id>/  (user-installed)
//   2. <appPath>/pets/<id>/   (built-in fallback, e.g. "default")
function safeResolveIn(root: string, url: URL): string | null {
  const petId = url.hostname;
  const filename = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!petId || !filename) return null;
  const resolved = normalize(join(root, petId, filename));
  if (!resolved.startsWith(root + sep)) return null;
  return resolved;
}

export function registerPetProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

export function handlePetProtocol(): void {
  const roots = [userPetsDir(), builtinPetsDir()];
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      for (const root of roots) {
        const filePath = safeResolveIn(root, url);
        if (filePath && existsSync(filePath)) {
          return net.fetch(pathToFileURL(filePath).toString());
        }
      }
      return new Response('not found', { status: 404 });
    } catch (err) {
      return new Response(`pet protocol error: ${(err as Error).message}`, {
        status: 500,
      });
    }
  });
}
