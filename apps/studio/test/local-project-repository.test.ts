/// <reference types="bun-types" />

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import type { ProjectRepository } from '@onlook/models';

import { LocalProjectRepository } from '../src/repositories';

let rootDir: string;
let repo: ProjectRepository;

beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'onlook-projects-'));
    repo = new LocalProjectRepository(rootDir);
});

afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
});

describe('LocalProjectRepository', () => {
    test('create persists a project and survives a fresh instance', async () => {
        const project = await repo.create({
            name: 'My Project',
            userId: 'local-user',
            description: 'A local project',
            tags: ['react', 'landing'],
        });

        expect(project.id).toBeString();
        expect(project.name).toBe('My Project');
        expect(project.metadata.description).toBe('A local project');
        expect(project.metadata.tags).toEqual(['react', 'landing']);
        expect(project.metadata.previewImg).toBeNull();

        // Persisted to disk: a new instance over the same directory reads it back.
        const fresh = new LocalProjectRepository(rootDir);
        const fetched = await fresh.get('local-user', project.id);
        expect(fetched).not.toBeNull();
        expect(fetched?.name).toBe('My Project');
    });

    test('create works without sandbox fields (local projects)', async () => {
        const project = await repo.create({ name: 'Offline', userId: 'u' });
        expect(project.name).toBe('Offline');
        const withCanvas = await repo.getProjectWithCanvas('u', project.id);
        expect(withCanvas?.frames[0]?.url).toBe('');
    });

    test('getProjectWithCanvas returns default canvas and desktop frame', async () => {
        const project = await repo.create({ name: 'P', userId: 'u' });
        const withCanvas = await repo.getProjectWithCanvas('u', project.id);

        expect(withCanvas).not.toBeNull();
        expect(withCanvas?.project.id).toBe(project.id);
        expect(withCanvas?.userCanvas.userId).toBe('u');
        expect(withCanvas?.userCanvas.scale).toBe(0.56);
        expect(withCanvas?.userCanvas.position).toEqual({ x: 120, y: 120 });
        expect(withCanvas?.frames).toHaveLength(1);
        expect(withCanvas?.frames[0]?.position).toEqual({ x: 150, y: 40 });
        expect(withCanvas?.frames[0]?.dimension).toEqual({ width: 1536, height: 960 });
    });

    test('listByUser returns projects sorted by most recently updated', async () => {
        const first = await repo.create({ name: 'A', userId: 'u' });
        const second = await repo.create({ name: 'B', userId: 'u' });
        await repo.update('u', { id: first.id, name: 'A renamed' });

        const projects = await repo.listByUser('u');
        expect(projects.map((p) => p.id)).toEqual([first.id, second.id]);
        expect(projects[0]?.name).toBe('A renamed');
    });

    test('listByUser supports limit and excludeProjectId', async () => {
        const first = await repo.create({ name: 'A', userId: 'u' });
        await repo.create({ name: 'B', userId: 'u' });

        const limited = await repo.listByUser('u', { limit: 1 });
        expect(limited).toHaveLength(1);

        const excluded = await repo.listByUser('u', { excludeProjectId: first.id });
        expect(excluded.map((p) => p.id)).not.toContain(first.id);
    });

    test('update patches fields, bumps updatedAt and survives JSON round-trip', async () => {
        const project = await repo.create({ name: 'A', userId: 'u' });
        const updated = await repo.update('u', {
            id: project.id,
            name: 'B',
            tags: ['x'],
            previewImg: {
                type: 'url',
                url: 'https://example.com/img.png',
                updatedAt: new Date(),
            },
        });

        expect(updated.name).toBe('B');
        expect(updated.metadata.tags).toEqual(['x']);
        expect(updated.metadata.previewImg?.url).toBe('https://example.com/img.png');
        expect(updated.metadata.updatedAt.getTime()).toBeGreaterThanOrEqual(
            project.metadata.updatedAt.getTime(),
        );

        // previewImg.updatedAt is a real Date after rehydration from disk.
        const fetched = await repo.get('u', project.id);
        expect(fetched?.metadata.previewImg?.updatedAt).toBeInstanceOf(Date);
    });

    test('addTag dedupes and removeTag removes', async () => {
        const project = await repo.create({ name: 'A', userId: 'u' });
        await repo.addTag('u', project.id, 'react');
        await repo.addTag('u', project.id, 'react');
        const afterAdd = await repo.get('u', project.id);
        expect(afterAdd?.metadata.tags).toEqual(['react']);

        const result = await repo.removeTag('u', project.id, 'react');
        expect(result.success).toBe(true);
        expect(result.tags).toEqual([]);
    });

    test('delete removes the project from disk and index', async () => {
        const project = await repo.create({ name: 'A', userId: 'u' });
        await repo.delete('u', project.id);

        expect(await repo.hasAccess('u', project.id)).toBe(false);
        expect(await repo.get('u', project.id)).toBeNull();
        expect(await repo.listByUser('u')).toHaveLength(0);
    });

    test('missing projects resolve to null (get) / false (hasAccess)', async () => {
        const missing = '00000000-0000-4000-8000-000000000000';
        expect(await repo.get('u', missing)).toBeNull();
        expect(await repo.hasAccess('u', missing)).toBe(false);
    });

    test('throws on update/delete of unknown project', async () => {
        const missing = '00000000-0000-4000-8000-000000000000';
        expect(repo.update('u', { id: missing, name: 'x' })).rejects.toThrow('Project not found');
        expect(repo.delete('u', missing)).rejects.toThrow('Project not found');
    });
});
