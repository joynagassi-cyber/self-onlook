/**
 * Shared contract between the Electron main process and the preload bridge.
 *
 * Re-exports the desktop contract from `@onlook/models/desktop` so that the
 * main process, the preload script and the renderer (web app) all type
 * against the same module — the renderer without importing Electron code.
 *
 * This module must stay dependency-free at runtime: it is bundled into both
 * the main process and the sandboxed preload script, and only ever re-exports
 * values (IPC channels) and types (erased at compile time).
 */
export {
    IPC,
    type AiConfig,
    type AiConfigInput,
    type AppInfo,
    type CreateLocalProjectInput,
    type CreateProjectInput,
    type FsDeleteRequest,
    type FsListEntry,
    type FsListRequest,
    type FsReadRequest,
    type FsReadResult,
    type FsResult,
    type FsStatRequest,
    type FsStatResult,
    type FsWriteRequest,
    type OnlookDesktopApi,
    type Project,
    type ProjectListOptions,
    type ProjectTagResult,
    type ProjectWithCanvas,
    type UpdateProjectInput,
} from '@onlook/models/desktop';
