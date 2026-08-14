import { contextBridge, ipcRenderer } from 'electron';

import type {
    AppInfo,
    CreateProjectInput,
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
    Project,
    ProjectListOptions,
    ProjectTagResult,
    ProjectWithCanvas,
    UpdateProjectInput,
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

    projectsList: (options?: ProjectListOptions) =>
        ipcRenderer.invoke(IPC.projectsList, options) as Promise<FsResult<Project[]>>,
    projectsGet: (projectId: string) =>
        ipcRenderer.invoke(IPC.projectsGet, projectId) as Promise<FsResult<Project | null>>,
    projectsGetWithCanvas: (projectId: string) =>
        ipcRenderer.invoke(IPC.projectsGetWithCanvas, projectId) as Promise<
            FsResult<ProjectWithCanvas | null>
        >,
    projectsCreate: (input: CreateProjectInput) =>
        ipcRenderer.invoke(IPC.projectsCreate, input) as Promise<FsResult<Project>>,
    projectsUpdate: (projectId: string, input: UpdateProjectInput) =>
        ipcRenderer.invoke(IPC.projectsUpdate, projectId, input) as Promise<FsResult<Project>>,
    projectsDelete: (projectId: string) =>
        ipcRenderer.invoke(IPC.projectsDelete, projectId) as Promise<FsResult<boolean>>,
    projectsAddTag: (projectId: string, tag: string) =>
        ipcRenderer.invoke(IPC.projectsAddTag, projectId, tag) as Promise<
            FsResult<ProjectTagResult>
        >,
    projectsRemoveTag: (projectId: string, tag: string) =>
        ipcRenderer.invoke(IPC.projectsRemoveTag, projectId, tag) as Promise<
            FsResult<ProjectTagResult>
        >,
};

contextBridge.exposeInMainWorld('onlook', api);
