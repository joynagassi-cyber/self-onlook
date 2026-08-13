import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { NodeFsProvider } from '../src/providers/nodefs';

describe('NodeFsProvider', () => {
    let rootDir: string;
    let provider: NodeFsProvider;

    beforeAll(async () => {
        rootDir = mkdtempSync(path.join(os.tmpdir(), 'nodefs-provider-'));
        provider = new NodeFsProvider({ rootDir });
        await provider.initialize({});
    });

    afterAll(async () => {
        await provider.destroy();
        rmSync(rootDir, { recursive: true, force: true });
    });

    test('writeFile and readFile round-trip text content', async () => {
        await provider.writeFile({
            args: { path: '/src/index.ts', content: 'export const a = 1;' },
        });
        const { file } = await provider.readFile({ args: { path: '/src/index.ts' } });
        expect(file.type).toBe('text');
        expect(file.content).toBe('export const a = 1;');
        expect(file.toString()).toBe('export const a = 1;');
    });

    test('readFile detects binary content', async () => {
        const bytes = new Uint8Array([0, 1, 2, 3, 255]);
        await provider.writeFile({ args: { path: '/assets/blob.bin', content: bytes } });
        const { file } = await provider.readFile({ args: { path: '/assets/blob.bin' } });
        expect(file.type).toBe('binary');
    });

    test('listFiles returns directory entries', async () => {
        await provider.createDirectory({ args: { path: '/pages' } });
        await provider.writeFile({ args: { path: '/pages/about.tsx', content: '' } });

        const rootEntries = await provider.listFiles({ args: { path: '/' } });
        expect(rootEntries.files.map((f) => f.name)).toContain('pages');

        const pages = await provider.listFiles({ args: { path: '/pages' } });
        expect(pages.files.map((f) => f.name)).toEqual(['about.tsx']);
        expect(pages.files[0]?.type).toBe('file');
    });

    test('statFile reports type and size', async () => {
        await provider.writeFile({ args: { path: '/data.txt', content: 'hello' } });
        const fileStat = await provider.statFile({ args: { path: '/data.txt' } });
        expect(fileStat.type).toBe('file');
        expect(fileStat.size).toBe(5);

        const dirStat = await provider.statFile({ args: { path: '/' } });
        expect(dirStat.type).toBe('directory');
    });

    test('renameFile moves files into new directories', async () => {
        await provider.writeFile({ args: { path: '/old.txt', content: 'x' } });
        await provider.renameFile({
            args: { oldPath: '/old.txt', newPath: '/nested/new.txt' },
        });
        const stat = await provider.statFile({ args: { path: '/nested/new.txt' } });
        expect(stat.type).toBe('file');
    });

    test('copyFiles copies directories recursively', async () => {
        await provider.copyFiles({
            args: { sourcePath: '/nested', targetPath: '/nested-copy' },
        });
        const { file } = await provider.readFile({ args: { path: '/nested-copy/new.txt' } });
        expect(file.content).toBe('x');
    });

    test('deleteFiles removes recursively', async () => {
        await provider.deleteFiles({ args: { path: '/nested-copy', recursive: true } });
        expect(provider.statFile({ args: { path: '/nested-copy' } })).rejects.toThrow();
    });

    test('writeFile rejects existing files when overwrite is false', async () => {
        await provider.writeFile({ args: { path: '/existing.txt', content: 'a' } });
        expect(
            provider.writeFile({
                args: { path: '/existing.txt', content: 'b', overwrite: false },
            }),
        ).rejects.toThrow();
    });

    test('rejects paths escaping the provider root', async () => {
        expect(
            provider.writeFile({ args: { path: '/../escape.txt', content: 'nope' } }),
        ).rejects.toThrow(/escapes/);
    });

    test('runCommand executes through the shell', async () => {
        const { output } = await provider.runCommand({ args: { command: 'echo nodefs-ok' } });
        expect(output).toContain('nodefs-ok');
    });

    test('gitStatus returns changed files inside a git repository', async () => {
        const gitRoot = mkdtempSync(path.join(os.tmpdir(), 'nodefs-git-'));
        const gitProvider = new NodeFsProvider({ rootDir: gitRoot });
        await gitProvider.initialize({});
        try {
            const init = spawnSync('git', ['init', '-q', gitRoot]);
            expect(init.status).toBe(0);
            writeFileSync(path.join(gitRoot, 'tracked.txt'), 'hi');
            const { changedFiles } = await gitProvider.gitStatus({});
            expect(changedFiles).toContain('tracked.txt');
        } finally {
            await gitProvider.destroy();
            rmSync(gitRoot, { recursive: true, force: true });
        }
    });

    test('gitStatus tolerates directories without git', async () => {
        const { changedFiles } = await provider.gitStatus({});
        expect(changedFiles).toEqual([]);
    });
});
