/**
 * Copies the assets the Next.js standalone build does not bundle into the
 * standalone output directory, so `apps/studio` can ship a fully self-contained
 * web server inside the Electron app.
 *
 * Equivalent to the previous bash one-liner:
 *   { cp -r public .next/standalone/apps/web/client/ && cp -r .next/static .next/standalone/apps/web/client/.next/; } 2>/dev/null
 * but portable across Windows/macOS/Linux (the bash `{ ...; }` group syntax
 * and `cp` are not available on the Windows GitHub Actions runner).
 */
import { cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const standaloneRoot = '.next/standalone/apps/web/client';

await mkdir(`${standaloneRoot}/.next`, { recursive: true });

if (existsSync('public')) {
    await cp('public', `${standaloneRoot}/public`, { recursive: true });
}

if (existsSync('.next/static')) {
    await cp('.next/static', `${standaloneRoot}/.next/static`, { recursive: true });
}

console.log('[standalone] assets copied into', standaloneRoot);
