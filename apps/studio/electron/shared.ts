/**
 * Shared contract between the Electron main process and the preload bridge.
 *
 * This module must stay dependency-free: it is bundled into both the main
 * process and the sandboxed preload script.
 */

export const IPC = {
    appInfo: 'app:info',
    selectProjectDir: 'app:select-project-dir',
    fsRoot: 'fs:root',
    fsList: 'fs:list',
    fsRead: 'fs:read',
    fsWrite: 'fs:write',
    fsStat: 'fs:stat',
    fsDelete: 'fs:delete',
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
}
