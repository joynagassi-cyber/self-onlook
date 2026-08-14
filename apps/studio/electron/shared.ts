/**
 * Shared contract between the Electron main process and the preload bridge.
 *
 * This module must stay dependency-free at runtime: it is bundled into both
 * the main process and the sandboxed preload script. Domain types are only
 * ever imported as types (erased at compile time).
 */

// Type-only: erased at compile time, so the module stays dependency-free at
// runtime while main.ts and preload.ts import the whole contract from here.
import type {
    CreateProjectInput,
    Project,
    ProjectListOptions,
    ProjectTagResult,
    ProjectWithCanvas,
    UpdateProjectInput,
} from '@onlook/models';

export type {
    CreateProjectInput,
    Project,
    ProjectListOptions,
    ProjectTagResult,
    ProjectWithCanvas,
    UpdateProjectInput,
} from '@onlook/models';

export const IPC = {
    appInfo: 'app:info',
    selectProjectDir: 'app:select-project-dir',
    fsRoot: 'fs:root',
    fsList: 'fs:list',
    fsRead: 'fs:read',
    fsWrite: 'fs:write',
    fsStat: 'fs:stat',
    fsDelete: 'fs:delete',
    projectsList: 'projects:list',
    projectsGet: 'projects:get',
    projectsGetWithCanvas: 'projects:get-with-canvas',
    projectsCreate: 'projects:create',
    projectsUpdate: 'projects:update',
    projectsDelete: 'projects:delete',
    projectsAddTag: 'projects:add-tag',
    projectsRemoveTag: 'projects:remove-tag',
} as const;

export interface AppInfo {
    platform: string;
    appVersion: string;
    electron: string;
    chrome: string;
    node: string;
}

export interface FsListRequest {
    path: string;
}

export interface FsListEntry {
    name: string;
    type: 'file' | 'directory';
    isSymlink: boolean;
}

export interface FsReadRequest {
    path: string;
}

export interface FsReadResult {
    path: string;
    content: string;
    type: 'text' | 'binary';
}

export interface FsWriteRequest {
    path: string;
    content: string;
    overwrite?: boolean;
}

export interface FsStatRequest {
    path: string;
}

export interface FsStatResult {
    type: 'file' | 'directory';
    size?: number;
    mtime?: number;
}

export interface FsDeleteRequest {
    path: string;
    recursive?: boolean;
}

export type FsResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * API surface exposed to the renderer as `window.onlook`.
 */
export interface OnlookDesktopApi {
    getAppInfo(): Promise<FsResult<AppInfo>>;
    selectProjectDir(): Promise<FsResult<string | null>>;
    fsRoot(): Promise<FsResult<string>>;
    fsList(request: FsListRequest): Promise<FsResult<FsListEntry[]>>;
    fsRead(request: FsReadRequest): Promise<FsResult<FsReadResult>>;
    fsWrite(request: FsWriteRequest): Promise<FsResult<boolean>>;
    fsStat(request: FsStatRequest): Promise<FsResult<FsStatResult>>;
    fsDelete(request: FsDeleteRequest): Promise<FsResult<boolean>>;

    /**
     * Local project metadata store (JSON files under the app's userData
     * directory), backed by `LocalProjectRepository`. Single-user: the main
     * process acts as the local user.
     */
    projectsList(options?: ProjectListOptions): Promise<FsResult<Project[]>>;
    projectsGet(projectId: string): Promise<FsResult<Project | null>>;
    projectsGetWithCanvas(projectId: string): Promise<FsResult<ProjectWithCanvas | null>>;
    projectsCreate(input: CreateProjectInput): Promise<FsResult<Project>>;
    projectsUpdate(projectId: string, input: UpdateProjectInput): Promise<FsResult<Project>>;
    projectsDelete(projectId: string): Promise<FsResult<boolean>>;
    projectsAddTag(projectId: string, tag: string): Promise<FsResult<ProjectTagResult>>;
    projectsRemoveTag(projectId: string, tag: string): Promise<FsResult<ProjectTagResult>>;
}
