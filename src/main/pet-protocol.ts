import { net, protocol } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { builtinPetsDir, userPetsDir } from './pets/registry';
import { loadPet } from './pets/loader';

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
        if (!filePath || !existsSync(filePath)) continue;

        // Manifest requests go through the loader so the renderer sees the
        // app's canonical PetState keys (typing/busy/...) instead of the raw
        // codex-format keys (greet/jump/review) some pets ship with on disk.
        // Streaming the file directly bypassed normalization and broke the
        // animator lookups after the codex→app state mapping landed.
        if (filePath.endsWith(`${sep}manifest.json`) || filePath.endsWith(`${sep}pet.json`)) {
          const pet = await loadPet(dirname(filePath));
          return new Response(JSON.stringify(pet.manifest), {
            headers: { 'content-type': 'application/json' },
          });
        }

        return net.fetch(pathToFileURL(filePath).toString());
      }
      return new Response('not found', { status: 404 });
    } catch (err) {
      return new Response(`pet protocol error: ${(err as Error).message}`, {
        status: 500,
      });
    }
  });
}
