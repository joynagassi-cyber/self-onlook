#!/usr/bin/env bun
/**
 * Onlook Desktop development launcher.
 *
 * Starts the web app dev server, waits until it responds, then launches
 * Electron pointed at it. Ctrl-C tears both down.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const DEV_URL = process.env.ONLOOK_DEV_URL ?? 'http://127.0.0.1:3000';

/** Same location as `electron/config.ts` so dev and packaged runs agree. */
const AI_CONFIG_FILE = path.join(os.homedir(), '.onlook', 'ai-config.json');

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await new Promise((resolve, reject) => {
                const request = http.get(url, (response) => {
                    response.resume();
                    resolve();
                });
                request.setTimeout(1000, () => request.destroy());
                request.once('error', () => reject(new Error('unreachable')));
            });
            return;
        } catch {
            await sleep(500);
        }
    }
    throw new Error(`Timed out waiting for the web app at ${url}`);
}

function shutdown(code) {
    web.kill('SIGTERM');
    process.exit(code);
}

const web = spawn('bun', ['--filter', '@onlook/web-client', 'dev'], {
    stdio: 'inherit',
    env: { ...process.env, CUSTOM_AI_CONFIG_FILE: AI_CONFIG_FILE },
});

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

try {
    console.log(`[desktop] waiting for the web app at ${DEV_URL} ...`);
    await waitForServer(DEV_URL, 120_000);
    console.log('[desktop] web app is ready, launching Electron ...');
    const electron = spawn('bunx', ['electron', '.'], {
        stdio: 'inherit',
        env: { ...process.env, ONLOOK_DEV_URL: DEV_URL },
    });
    electron.on('exit', (code) => shutdown(code ?? 0));
} catch (error) {
    console.error('[desktop] failed to start:', error);
    web.kill('SIGTERM');
    process.exit(1);
}
