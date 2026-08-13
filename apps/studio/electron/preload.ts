import { contextBridge, ipcRenderer } from 'electron';

import type {
    AppInfo,
    FsDeleteRequest,
    FsListEntry,
    FsListRequest,
    FsReadRequest,
    FsReadResult,
    FsResult,
    FsStatRequest,
    FsStatResult,
    FsWriteRequest,
    OnlookDesktopApi,
} from './shared';
import { IPC } from './shared';

/**
 * Minimal, typed bridge exposed as `window.onlook`.
 *
 * The preload runs sandboxed (contextIsolation on, nodeIntegration off):
 * it only forwards structured requests to the main process over IPC and
 * never touches Node APIs directly.
 */
const api: OnlookDesktopApi = {
    getAppInfo: () => ipcRenderer.invoke(IPC.appInfo) as Promise<FsResult<AppInfo>>,
    selectProjectDir: () =>
        ipcRenderer.invoke(IPC.selectProjectDir) as Promise<FsResult<string | null>>,
    fsRoot: () => ipcRenderer.invoke(IPC.fsRoot) as Promise<FsResult<string>>,
    fsList: (request: FsListRequest) =>
        ipcRenderer.invoke(IPC.fsList, request) as Promise<FsResult<FsListEntry[]>>,
    fsRead: (request: FsReadRequest) =>
        ipcRenderer.invoke(IPC.fsRead, request) as Promise<FsResult<FsReadResult>>,
    fsWrite: (request: FsWriteRequest) =>
        ipcRenderer.invoke(IPC.fsWrite, request) as Promise<FsResult<boolean>>,
    fsStat: (request: FsStatRequest) =>
        ipcRenderer.invoke(IPC.fsStat, request) as Promise<FsResult<FsStatResult>>,
    fsDelete: (request: FsDeleteRequest) =>
        ipcRenderer.invoke(IPC.fsDelete, request) as Promise<FsResult<boolean>>,
};

contextBridge.exposeInMainWorld('onlook', api);
