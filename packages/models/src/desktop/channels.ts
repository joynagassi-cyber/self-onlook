/**
 * IPC channel names shared between the Electron main process, the preload
 * bridge and the renderer.
 *
 * These are runtime values (used as `ipcRenderer.invoke` / `ipcMain.handle`
 * keys), so they intentionally live outside the type-only desktop module.
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
    projectsList: 'projects:list',
    projectsGet: 'projects:get',
    projectsGetWithCanvas: 'projects:get-with-canvas',
    projectsCreate: 'projects:create',
    projectsUpdate: 'projects:update',
    projectsDelete: 'projects:delete',
    projectsAddTag: 'projects:add-tag',
    projectsRemoveTag: 'projects:remove-tag',
} as const;
