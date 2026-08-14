import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';

import { NodeFsProvider } from '@onlook/code-provider/providers/nodefs';

import type {
    AppInfo,
    CreateLocalProjectInput,
    CreateProjectInput,
    FsDeleteRequest,
    FsListRequest,
    FsReadRequest,
    FsResult,
    FsStatRequest,
    FsWriteRequest,
    ProjectListOptions,
    UpdateProjectInput,
} from './shared';
import { LocalProjectRepository } from '../src/repositories';
import { IPC } from './shared';

/**
 * Onlook Desktop main process.
 *
 * - Development: loads the web app dev server (ONLOOK_DEV_URL, default
 *   http://127.0.0.1:3000).
 * - Packaged: spawns the bundled Next.js standalone server with
 *   ELECTRON_RUN_AS_NODE (no extra Node runtime needed) and loads it.
 * - Exposes a local filesystem API backed by @onlook/code-provider's
 *   NodeFsProvider so the renderer can work with local project folders
 *   without ever touching Node APIs directly.
 */

const DEV_URL = process.env.ONLOOK_DEV_URL ?? 'http://127.0.0.1:3000';
const PORT_START = 3210;
const PORT_END = 3410;

/** Identity used for the local project store (single-user desktop). */
const LOCAL_USER_ID = 'desktop-local-user';

let mainWindow: BrowserWindow | null = null;
let webServer: ChildProcess | null = null;
let fsProvider: NodeFsProvider | null = null;
let fsRootDir: string | null = null;
let appUrl: string | null = null;
let projectRepository: LocalProjectRepository | null = null;

function safe<T>(operation: () => Promise<T>): Promise<FsResult<T>> {
    return operation().then(
        (value) => ({ ok: true as const, value }),
        (error: unknown) => ({
            ok: false as const,
            error: error instanceof Error ? error.message : String(error),
        }),
    );
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const tryPort = (port: number): void => {
            if (port > PORT_END) {
                reject(new Error('No free port available for the local web server'));
                return;
            }
            const server = http.createServer();
            server.once('error', () => {
                server.close();
                tryPort(port + 1);
            });
            server.listen(port, '127.0.0.1', () => {
                const address = server.address();
                server.close();
                if (address && typeof address === 'object') {
                    resolve(address.port);
                } else {
                    reject(new Error('Could not determine a local port'));
                }
            });
        };
        tryPort(PORT_START);
    });
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            await new Promise<void>((resolve, reject) => {
                const request = http.get(url, (response) => {
                    response.resume();
                    resolve();
                });
                request.setTimeout(1000, () => request.destroy());
                request.once('error', () => reject(new Error('unreachable')));
            });
            return;
        } catch {
            await sleep(500);
        }
    }
    throw new Error(`Timed out waiting for the web app at ${url}`);
}

async function startStandaloneServer(): Promise<string> {
    const serverDir = path.join(process.resourcesPath, 'app');
    const serverJs = path.join(serverDir, 'server.js');
    if (!existsSync(serverJs)) {
        throw new Error(
            `Web app not found at ${serverJs}. Rebuild the desktop app ("bun run package").`,
        );
    }
    const port = await findFreePort();
    webServer = spawn(process.execPath, [serverJs], {
        cwd: serverDir,
        env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            NODE_ENV: 'production',
            HOSTNAME: '127.0.0.1',
            PORT: String(port),
            SKIP_ENV_VALIDATION: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    webServer.stdout?.on('data', (chunk: Buffer) => {
        console.log(`[web] ${chunk.toString().trimEnd()}`);
    });
    webServer.stderr?.on('data', (chunk: Buffer) => {
        console.error(`[web] ${chunk.toString().trimEnd()}`);
    });
    webServer.once('exit', (code) => {
        console.error(`[web] local server exited with code ${code}`);
    });

    const url = `http://127.0.0.1:${port}`;
    await waitForUrl(url, 60_000);
    return url;
}

function createWindow(url: string): void {
    mainWindow = new BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        title: 'Onlook',
        backgroundColor: '#09090B',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    // External links open in the system browser, never inside the app window.
    mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
        if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
            void shell.openExternal(targetUrl);
        }
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    void mainWindow.loadURL(url);
}

function registerIpc(): void {
    ipcMain.handle(IPC.appInfo, () =>
        safe(
            async (): Promise<AppInfo> => ({
                platform: process.platform,
                appVersion: app.getVersion(),
                electron: process.versions.electron ?? '',
                chrome: process.versions.chrome ?? '',
                node: process.versions.node ?? '',
            }),
        ),
    );

    ipcMain.handle(IPC.selectProjectDir, () =>
        safe(async (): Promise<string | null> => {
            const options = {
                title: 'Select a project folder',
                properties: ['openDirectory', 'createDirectory'],
            };
            const result = mainWindow
                ? await dialog.showOpenDialog(mainWindow, options)
                : await dialog.showOpenDialog(options);
            const selected = result.filePaths[0];
            if (!selected) {
                return null;
            }
            const provider = await createFsProvider(selected);
            const previous = fsProvider;
            fsProvider = provider;
            fsRootDir = selected;
            await previous?.destroy();
            return selected;
        }),
    );

    ipcMain.handle(IPC.fsRoot, () =>
        safe(async (): Promise<string> => {
            if (!fsRootDir) {
                throw new Error('Project directory is not set');
            }
            return fsRootDir;
        }),
    );

    ipcMain.handle(IPC.fsList, (_event, request: FsListRequest) =>
        safe(async () => {
            const result = await requireFsProvider().listFiles({ args: { path: request.path } });
            return result.files.map((file) => ({
                name: file.name,
                type: file.type,
                isSymlink: file.isSymlink,
            }));
        }),
    );

    ipcMain.handle(IPC.fsRead, (_event, request: FsReadRequest) =>
        safe(async () => {
            const result = await requireFsProvider().readFile({ args: { path: request.path } });
            return {
                path: result.file.path,
                content: result.file.toString(),
                type: result.file.type,
            };
        }),
    );

    ipcMain.handle(IPC.fsWrite, (_event, request: FsWriteRequest) =>
        safe(async (): Promise<boolean> => {
            const { success } = await requireFsProvider().writeFile({
                args: {
                    path: request.path,
                    content: request.content,
                    overwrite: request.overwrite,
                },
            });
            return success;
        }),
    );

    ipcMain.handle(IPC.fsStat, (_event, request: FsStatRequest) =>
        safe(async () => {
            const result = await requireFsProvider().statFile({ args: { path: request.path } });
            return {
                type: result.type,
                size: result.size,
                mtime: result.mtime,
            };
        }),
    );

    ipcMain.handle(IPC.fsDelete, (_event, request: FsDeleteRequest) =>
        safe(async (): Promise<boolean> => {
            await requireFsProvider().deleteFiles({
                args: { path: request.path, recursive: request.recursive },
            });
            return true;
        }),
    );

    ipcMain.handle(IPC.projectsList, (_event, options?: ProjectListOptions) =>
        safe(async () => requireProjectRepository().listByUser(LOCAL_USER_ID, options)),
    );

    ipcMain.handle(IPC.projectsGet, (_event, projectId: string) =>
        safe(async () => requireProjectRepository().get(LOCAL_USER_ID, projectId)),
    );

    ipcMain.handle(IPC.projectsGetWithCanvas, (_event, projectId: string) =>
        safe(async () => requireProjectRepository().getProjectWithCanvas(LOCAL_USER_ID, projectId)),
    );

    ipcMain.handle(IPC.projectsCreate, (_event, input: CreateLocalProjectInput) =>
        safe(async () =>
            requireProjectRepository().create({
                ...input,
                // The renderer never picks the identity — local projects all
                // belong to the desktop's single local user.
                userId: LOCAL_USER_ID,
            }),
        ),
    );

    ipcMain.handle(IPC.projectsUpdate, (_event, projectId: string, input: UpdateProjectInput) =>
        safe(async () =>
            requireProjectRepository().update(LOCAL_USER_ID, { ...input, id: projectId }),
        ),
    );

    ipcMain.handle(IPC.projectsDelete, (_event, projectId: string) =>
        safe(async (): Promise<boolean> => {
            await requireProjectRepository().delete(LOCAL_USER_ID, projectId);
            return true;
        }),
    );

    ipcMain.handle(IPC.projectsAddTag, (_event, projectId: string, tag: string) =>
        safe(async () => requireProjectRepository().addTag(LOCAL_USER_ID, projectId, tag)),
    );

    ipcMain.handle(IPC.projectsRemoveTag, (_event, projectId: string, tag: string) =>
        safe(async () => requireProjectRepository().removeTag(LOCAL_USER_ID, projectId, tag)),
    );
}

function requireFsProvider(): NodeFsProvider {
    if (!fsProvider) {
        throw new Error('Filesystem provider is not initialized');
    }
    return fsProvider;
}

function requireProjectRepository(): LocalProjectRepository {
    if (!projectRepository) {
        throw new Error('Local project store is not initialized');
    }
    return projectRepository;
}

async function createFsProvider(rootDir: string): Promise<NodeFsProvider> {
    const provider = new NodeFsProvider({ rootDir });
    await provider.initialize({});
    return provider;
}

async function bootstrap(): Promise<void> {
    fsRootDir = path.join(app.getPath('userData'), 'projects');
    fsProvider = await createFsProvider(fsRootDir);
    // Local project metadata lives in its own directory so the JSON store
    // never mixes with the user's project files.
    projectRepository = new LocalProjectRepository(
        path.join(app.getPath('userData'), 'local-projects'),
    );
    registerIpc();

    if (app.isPackaged) {
        appUrl = await startStandaloneServer();
    } else {
        appUrl = DEV_URL;
        await waitForUrl(appUrl, 120_000);
    }
    createWindow(appUrl);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) {
                mainWindow.restore();
            }
            mainWindow.focus();
        }
    });

    void app.whenReady().then(async () => {
        try {
            await bootstrap();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            dialog.showErrorBox('Onlook could not start', message);
            app.quit();
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0 && appUrl) {
            createWindow(appUrl);
        }
    });

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') {
            app.quit();
        }
    });

    app.on('before-quit', () => {
        webServer?.kill('SIGTERM');
        webServer = null;
        void fsProvider?.destroy().catch(() => {
            // Provider teardown is best-effort during shutdown.
        });
        fsProvider = null;
    });
}
