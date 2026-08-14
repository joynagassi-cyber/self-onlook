import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
    type Canvas,
    type CreateProjectInput,
    type Frame,
    type PreviewImg,
    type Project,
    type ProjectListOptions,
    type ProjectRepository,
    type ProjectTagResult,
    type ProjectWithCanvas,
    type UpdateProjectInput,
} from '@onlook/models';

// Mirrors the web runtime defaults (packages/db/src/defaults).
const DEFAULT_CANVAS_SCALE = 0.56;
const DEFAULT_CANVAS_X = 120;
const DEFAULT_CANVAS_Y = 120;
const DEFAULT_FRAME_X = 150;
const DEFAULT_FRAME_Y = 40;
const DEFAULT_FRAME_WIDTH = 1536;
const DEFAULT_FRAME_HEIGHT = 960;

/** On-disk shape of a preview image — `updatedAt` stored as an ISO string. */
interface StoredPreviewImg {
    type: 'storage' | 'url';
    storagePath?: {
        bucket: string;
        path: string;
    };
    url?: string;
    updatedAt: string | null;
}

/** On-disk shape of a project payload — dates stored as ISO strings. */
interface StoredProjectWithCanvas {
    project: {
        id: string;
        name: string;
        metadata: {
            createdAt: string;
            updatedAt: string;
            previewImg: StoredPreviewImg | null;
            description: string | null;
            tags: string[];
        };
    };
    userCanvas: Canvas;
    frames: Frame[];
}

const toStoredPreviewImg = (previewImg: PreviewImg | null): StoredPreviewImg | null => {
    if (!previewImg) {
        return null;
    }
    return {
        ...previewImg,
        updatedAt: previewImg.updatedAt ? previewImg.updatedAt.toISOString() : null,
    };
};

const fromStoredPreviewImg = (previewImg: StoredPreviewImg | null): PreviewImg | null => {
    if (!previewImg) {
        return null;
    }
    return {
        ...previewImg,
        updatedAt: previewImg.updatedAt ? new Date(previewImg.updatedAt) : null,
    };
};

const toStored = (value: ProjectWithCanvas): StoredProjectWithCanvas => ({
    project: {
        id: value.project.id,
        name: value.project.name,
        metadata: {
            createdAt: value.project.metadata.createdAt.toISOString(),
            updatedAt: value.project.metadata.updatedAt.toISOString(),
            previewImg: toStoredPreviewImg(value.project.metadata.previewImg),
            description: value.project.metadata.description,
            tags: value.project.metadata.tags,
        },
    },
    userCanvas: value.userCanvas,
    frames: value.frames,
});

const fromStored = (value: StoredProjectWithCanvas): ProjectWithCanvas => ({
    project: {
        id: value.project.id,
        name: value.project.name,
        metadata: {
            createdAt: new Date(value.project.metadata.createdAt),
            updatedAt: new Date(value.project.metadata.updatedAt),
            previewImg: fromStoredPreviewImg(value.project.metadata.previewImg),
            description: value.project.metadata.description,
            tags: value.project.metadata.tags,
        },
    },
    userCanvas: value.userCanvas,
    frames: value.frames,
});

/**
 * Local, JSON-file backed implementation of {@link ProjectRepository}.
 *
 * Every project is stored as a single file (`<projectId>.json`) under the
 * configured root directory, next to an `index.json` tracking the list of
 * project ids. Dates are persisted as ISO strings and rehydrated on read.
 *
 * The adapter is single-user: any project present on disk belongs to the
 * local user, so `userId` arguments are accepted (interface contract) but do
 * not restrict access. Defaults mirror the web runtime (desktop canvas at
 * scale 0.56 / (120,120), desktop frame 1536x960).
 */
export class LocalProjectRepository implements ProjectRepository {
    constructor(private readonly rootDir: string) {}

    private get indexPath(): string {
        return join(this.rootDir, 'index.json');
    }

    private projectPath(projectId: string): string {
        return join(this.rootDir, `${projectId}.json`);
    }

    private async ensureIndex(): Promise<string[]> {
        try {
            const raw = await readFile(this.indexPath, 'utf-8');
            const parsed = JSON.parse(raw) as { projects: string[] };
            return parsed.projects ?? [];
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }

    private async saveIndex(ids: string[]): Promise<void> {
        await mkdir(this.rootDir, { recursive: true });
        await writeFile(this.indexPath, JSON.stringify({ projects: ids }, null, 2), 'utf-8');
    }

    private async readWithCanvas(projectId: string): Promise<ProjectWithCanvas | null> {
        try {
            const raw = await readFile(this.projectPath(projectId), 'utf-8');
            return fromStored(JSON.parse(raw) as StoredProjectWithCanvas);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }

    private async writeWithCanvas(payload: ProjectWithCanvas): Promise<void> {
        await mkdir(this.rootDir, { recursive: true });
        await writeFile(
            this.projectPath(payload.project.id),
            JSON.stringify(toStored(payload), null, 2),
            'utf-8',
        );
    }

    async listByUser(_userId: string, options?: ProjectListOptions): Promise<Project[]> {
        let ids = await this.ensureIndex();
        if (options?.excludeProjectId) {
            ids = ids.filter((id) => id !== options.excludeProjectId);
        }
        const projects = (await Promise.all(ids.map((id) => this.readWithCanvas(id))))
            .filter((payload): payload is ProjectWithCanvas => payload !== null)
            .map((payload) => payload.project)
            .sort((a, b) => b.metadata.updatedAt.getTime() - a.metadata.updatedAt.getTime());
        return options?.limit ? projects.slice(0, options.limit) : projects;
    }

    async get(_userId: string, projectId: string): Promise<Project | null> {
        const payload = await this.readWithCanvas(projectId);
        return payload?.project ?? null;
    }

    async getProjectWithCanvas(
        _userId: string,
        projectId: string,
    ): Promise<ProjectWithCanvas | null> {
        return this.readWithCanvas(projectId);
    }

    async hasAccess(_userId: string, projectId: string): Promise<boolean> {
        return (await this.readWithCanvas(projectId)) !== null;
    }

    async create(input: CreateProjectInput): Promise<Project> {
        const now = new Date();
        const project: Project = {
            id: randomUUID(),
            name: input.name,
            metadata: {
                createdAt: now,
                updatedAt: now,
                previewImg: null,
                description: input.description ?? null,
                tags: input.tags ?? [],
            },
        };
        const userCanvas: Canvas = {
            id: randomUUID(),
            scale: DEFAULT_CANVAS_SCALE,
            position: { x: DEFAULT_CANVAS_X, y: DEFAULT_CANVAS_Y },
            userId: input.userId,
        };
        // Local projects have no branches; the synthetic id keeps the Frame
        // shape intact for consumers of getProjectWithCanvas.
        const frame: Frame = {
            id: randomUUID(),
            canvasId: userCanvas.id,
            branchId: randomUUID(),
            url: input.sandboxUrl ?? '',
            position: { x: DEFAULT_FRAME_X, y: DEFAULT_FRAME_Y },
            dimension: { width: DEFAULT_FRAME_WIDTH, height: DEFAULT_FRAME_HEIGHT },
        };
        const payload: ProjectWithCanvas = { project, userCanvas, frames: [frame] };

        await this.writeWithCanvas(payload);
        const ids = await this.ensureIndex();
        ids.push(project.id);
        await this.saveIndex(ids);
        return project;
    }

    async update(_userId: string, input: UpdateProjectInput): Promise<Project> {
        const payload = await this.readWithCanvas(input.id);
        if (!payload) {
            throw new Error(`Project not found: ${input.id}`);
        }
        const { project } = payload;
        if (input.name !== undefined) {
            project.name = input.name;
        }
        if (input.description !== undefined) {
            project.metadata.description = input.description;
        }
        if (input.tags !== undefined) {
            project.metadata.tags = input.tags;
        }
        if (input.previewImg !== undefined) {
            project.metadata.previewImg = input.previewImg;
        }
        project.metadata.updatedAt = new Date();
        await this.writeWithCanvas(payload);
        return project;
    }

    async delete(_userId: string, projectId: string): Promise<void> {
        const ids = await this.ensureIndex();
        if (!ids.includes(projectId)) {
            throw new Error(`Project not found: ${projectId}`);
        }
        await rm(this.projectPath(projectId), { force: true });
        await this.saveIndex(ids.filter((id) => id !== projectId));
    }

    async addTag(_userId: string, projectId: string, tag: string): Promise<ProjectTagResult> {
        const payload = await this.readWithCanvas(projectId);
        if (!payload) {
            throw new Error(`Project not found: ${projectId}`);
        }
        const { tags } = payload.project.metadata;
        const newTags = tags.includes(tag) ? tags : [...tags, tag];
        payload.project.metadata.tags = newTags;
        payload.project.metadata.updatedAt = new Date();
        await this.writeWithCanvas(payload);
        return { success: true, tags: newTags };
    }

    async removeTag(_userId: string, projectId: string, tag: string): Promise<ProjectTagResult> {
        const payload = await this.readWithCanvas(projectId);
        if (!payload) {
            throw new Error(`Project not found: ${projectId}`);
        }
        const newTags = payload.project.metadata.tags.filter((t) => t !== tag);
        payload.project.metadata.tags = newTags;
        payload.project.metadata.updatedAt = new Date();
        await this.writeWithCanvas(payload);
        return { success: true, tags: newTags };
    }
}
