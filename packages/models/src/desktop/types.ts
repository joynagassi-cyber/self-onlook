import type { Project } from '../project/';
import type {
    CreateProjectInput,
    ProjectListOptions,
    ProjectTagResult,
    ProjectWithCanvas,
    UpdateProjectInput,
} from '../repository/';
import type { IPC } from './channels';

export type { IPC };

export type {
    CreateProjectInput,
    Project,
    ProjectListOptions,
    ProjectTagResult,
    ProjectWithCanvas,
    UpdateProjectInput,
};

/** Static information about the desktop runtime the web app runs inside. */
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

/**
 * Result envelope returned by every desktop IPC method. The main process
 * never lets an exception cross the IPC boundary: errors are returned as
 * `{ ok: false, error }` instead.
 */
export type FsResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Create input for the local store. `userId` is intentionally absent: the
 * main process always acts as the desktop's single local user, so the
 * renderer never picks an identity.
 */
export type CreateLocalProjectInput = Omit<CreateProjectInput, 'userId'>;

/**
 * The desktop API surface exposed to the renderer as `window.onlook` by the
 * preload bridge. Domain types come from the shared project model, so the
 * web app can consume the desktop runtime without importing Electron code.
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
    projectsCreate(input: CreateLocalProjectInput): Promise<FsResult<Project>>;
    projectsUpdate(projectId: string, input: UpdateProjectInput): Promise<FsResult<Project>>;
    projectsDelete(projectId: string): Promise<FsResult<boolean>>;
    projectsAddTag(projectId: string, tag: string): Promise<FsResult<ProjectTagResult>>;
    projectsRemoveTag(projectId: string, tag: string): Promise<FsResult<ProjectTagResult>>;
}
