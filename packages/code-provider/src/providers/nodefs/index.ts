import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs, watch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ChildProcess } from 'node:child_process';
import type { FSWatcher } from 'node:fs';

import { convertToBase64 } from '@onlook/utility';

import type {
    CopyFileOutput,
    CopyFilesInput,
    CreateDirectoryInput,
    CreateDirectoryOutput,
    CreateProjectInput,
    CreateProjectOutput,
    CreateSessionInput,
    CreateSessionOutput,
    CreateTerminalInput,
    CreateTerminalOutput,
    DeleteFilesInput,
    DeleteFilesOutput,
    DownloadFilesInput,
    DownloadFilesOutput,
    GetTaskInput,
    GetTaskOutput,
    GitStatusInput,
    GitStatusOutput,
    InitializeInput,
    InitializeOutput,
    ListFilesInput,
    ListFilesOutput,
    ListProjectsInput,
    ListProjectsOutput,
    PauseProjectInput,
    PauseProjectOutput,
    ReadFileInput,
    ReadFileOutput,
    RenameFileInput,
    RenameFileOutput,
    SetupInput,
    SetupOutput,
    StatFileInput,
    StatFileOutput,
    StopProjectInput,
    StopProjectOutput,
    TerminalBackgroundCommandInput,
    TerminalBackgroundCommandOutput,
    TerminalCommandInput,
    TerminalCommandOutput,
    WatchEvent,
    WatchFilesInput,
    WatchFilesOutput,
    WriteFileInput,
    WriteFileOutput,
} from '../../types';
import {
    Provider,
    ProviderBackgroundCommand,
    ProviderFileWatcher,
    ProviderTask,
    ProviderTerminal,
} from '../../types';

export interface NodeFsProviderOptions {
    /** Root directory of the local project. Defaults to `process.cwd()`. */
    rootDir?: string;
    /** Shell binary used for terminals and commands. Defaults to the platform shell. */
    shell?: string;
    /** Named dev tasks, e.g. `{ dev: { name: 'dev', command: 'bun run dev' } }`. */
    tasks?: Record<string, { name?: string; command: string }>;
}

/**
 * Local filesystem implementation of the sandbox `Provider` contract.
 *
 * This provider is Node-only: it is not exposed from the package root entry
 * (`@onlook/code-provider`) so the browser bundle stays free of Node builtins.
 * Import it directly from `@onlook/code-provider/providers/nodefs`.
 *
 * All sandbox paths are resolved against `rootDir`; paths escaping it are rejected.
 */
export class NodeFsProvider extends Provider {
    private readonly rootDir: string;
    private readonly shell: string;
    private readonly tasks: Record<string, { name?: string; command: string }> | undefined;
    private readonly watchers = new Set<NodeFsFileWatcher>();
    private readonly processes = new Set<ChildProcess>();

    constructor(options: NodeFsProviderOptions = {}) {
        super();
        this.rootDir = path.resolve(options.rootDir ?? process.cwd());
        this.shell = options.shell ?? (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
        this.tasks = options.tasks;
    }

    private resolvePath(inputPath: string): string {
        const resolved = path.normalize(path.join(this.rootDir, inputPath));
        if (resolved !== this.rootDir && !resolved.startsWith(this.rootDir + path.sep)) {
            throw new Error(`Path escapes provider root: ${inputPath}`);
        }
        return resolved;
    }

    private registerProcess = (child: ChildProcess): void => {
        this.processes.add(child);
    };

    async initialize(_input: InitializeInput): Promise<InitializeOutput> {
        await fs.mkdir(this.rootDir, { recursive: true });
        return {};
    }

    async setup(_input: SetupInput): Promise<SetupOutput> {
        return {};
    }

    async createSession(_input: CreateSessionInput): Promise<CreateSessionOutput> {
        return {};
    }

    async reload(): Promise<boolean> {
        return true;
    }

    async reconnect(): Promise<void> {
        // Nothing to reconnect to: the local filesystem is always available.
    }

    async ping(): Promise<boolean> {
        try {
            await fs.access(this.rootDir);
            return true;
        } catch {
            // Probe semantics: an unreachable root simply means the provider is down.
            return false;
        }
    }

    async destroy(): Promise<void> {
        for (const watcher of this.watchers) {
            await watcher.stop().catch(() => {
                // Watcher may already be closed; nothing else to clean up.
            });
        }
        this.watchers.clear();

        for (const child of this.processes) {
            if (!child.killed) {
                child.kill('SIGTERM');
            }
        }
        this.processes.clear();
    }

    static async createProject(input: CreateProjectInput): Promise<CreateProjectOutput> {
        const dir = path.join(process.cwd(), input.id);
        await fs.mkdir(dir, { recursive: true });
        return { id: input.id };
    }

    static async createProjectFromGit(input: {
        repoUrl: string;
        branch: string;
    }): Promise<CreateProjectOutput> {
        const segments = input.repoUrl.replace(/\.git$/, '').split('/');
        const lastSegment = segments[segments.length - 1];
        const repoName = lastSegment ?? 'project';
        const target = path.join(process.cwd(), repoName);
        const args = ['clone', input.repoUrl, target];
        if (input.branch) {
            args.push('--branch', input.branch, '--single-branch');
        }
        const result = spawnSync('git', args, { stdio: 'inherit' });
        if (result.status !== 0) {
            throw new Error(`git clone failed with exit code ${result.status}`);
        }
        return { id: repoName };
    }

    async pauseProject(_input: PauseProjectInput): Promise<PauseProjectOutput> {
        return {};
    }

    async stopProject(_input: StopProjectInput): Promise<StopProjectOutput> {
        return {};
    }

    async listProjects(_input: ListProjectsInput): Promise<ListProjectsOutput> {
        // Project enumeration is a repository-layer concern, not a filesystem one.
        // Consumers must handle the missing `projects` key (see the sandbox router).
        return {};
    }

    async writeFile(input: WriteFileInput): Promise<WriteFileOutput> {
        const target = this.resolvePath(input.args.path);
        const flag = input.args.overwrite === false ? 'wx' : 'w';
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, input.args.content, { flag });
        return { success: true };
    }

    async renameFile(input: RenameFileInput): Promise<RenameFileOutput> {
        const from = this.resolvePath(input.args.oldPath);
        const to = this.resolvePath(input.args.newPath);
        await fs.mkdir(path.dirname(to), { recursive: true });
        await fs.rename(from, to);
        return {};
    }

    async statFile(input: StatFileInput): Promise<StatFileOutput> {
        const stat = await fs.stat(this.resolvePath(input.args.path));
        return {
            type: stat.isDirectory() ? 'directory' : 'file',
            isSymlink: stat.isSymbolicLink(),
            size: stat.size,
            mtime: stat.mtimeMs,
            ctime: stat.ctimeMs,
            atime: stat.atimeMs,
        };
    }

    async deleteFiles(input: DeleteFilesInput): Promise<DeleteFilesOutput> {
        await fs.rm(this.resolvePath(input.args.path), {
            recursive: input.args.recursive ?? true,
            force: true,
        });
        return {};
    }

    async listFiles(input: ListFilesInput): Promise<ListFilesOutput> {
        const entries = await fs.readdir(this.resolvePath(input.args.path), {
            withFileTypes: true,
        });
        return {
            files: entries.map((entry) => ({
                name: entry.name,
                type: entry.isDirectory() ? 'directory' : 'file',
                isSymlink: entry.isSymbolicLink(),
            })),
        };
    }

    async readFile(input: ReadFileInput): Promise<ReadFileOutput> {
        const buffer = await fs.readFile(this.resolvePath(input.args.path));
        if (isTextContent(buffer)) {
            const content = buffer.toString('utf8');
            return {
                file: {
                    path: input.args.path,
                    content,
                    type: 'text',
                    toString: () => content,
                },
            };
        }
        const bytes = new Uint8Array(buffer);
        return {
            file: {
                path: input.args.path,
                content: bytes,
                type: 'binary',
                toString: () => convertToBase64(bytes),
            },
        };
    }

    async downloadFiles(input: DownloadFilesInput): Promise<DownloadFilesOutput> {
        return {
            url: pathToFileURL(this.resolvePath(input.args.path)).href,
        };
    }

    async copyFiles(input: CopyFilesInput): Promise<CopyFileOutput> {
        const source = this.resolvePath(input.args.sourcePath);
        const target = this.resolvePath(input.args.targetPath);

        if (input.args.overwrite === false) {
            try {
                await fs.access(target);
                throw new Error(`Target already exists: ${input.args.targetPath}`);
            } catch (error: unknown) {
                if (error instanceof Error && error.message.startsWith('Target already exists')) {
                    throw error;
                }
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }
        }

        await copyRecursive(source, target);
        return {};
    }

    async createDirectory(input: CreateDirectoryInput): Promise<CreateDirectoryOutput> {
        await fs.mkdir(this.resolvePath(input.args.path), { recursive: true });
        return {};
    }

    async watchFiles(input: WatchFilesInput): Promise<WatchFilesOutput> {
        const watcher = new NodeFsFileWatcher(this.rootDir);
        this.watchers.add(watcher);
        await watcher.start(input);

        if (input.onFileChange) {
            watcher.registerEventCallback(async (event) => {
                await input.onFileChange?.(event);
            });
        }
        return { watcher };
    }

    async createTerminal(_input: CreateTerminalInput): Promise<CreateTerminalOutput> {
        const terminal = new NodeFsTerminal(this.shell, this.rootDir, this.registerProcess);
        return { terminal };
    }

    async getTask(input: GetTaskInput): Promise<GetTaskOutput> {
        const config = this.tasks?.[input.args.id];
        if (!config) {
            throw new Error(`Task ${input.args.id} not found`);
        }
        const task = new NodeFsTask(
            input.args.id,
            config.name ?? input.args.id,
            config.command,
            this.shell,
            this.rootDir,
            this.registerProcess,
        );
        return { task };
    }

    async runCommand({ args }: TerminalCommandInput): Promise<TerminalCommandOutput> {
        const result = spawnSync(this.shell, shellArgs(this.shell, args.command), {
            cwd: this.rootDir,
            encoding: 'utf8',
        });
        const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
        return { output };
    }

    async runBackgroundCommand(
        input: TerminalBackgroundCommandInput,
    ): Promise<TerminalBackgroundCommandOutput> {
        const command = new NodeFsCommand(
            input.args.command,
            this.shell,
            this.rootDir,
            this.registerProcess,
        );
        await command.open();
        return { command };
    }

    async gitStatus(_input: GitStatusInput): Promise<GitStatusOutput> {
        const result = spawnSync('git', ['-C', this.rootDir, 'status', '--porcelain'], {
            encoding: 'utf8',
        });
        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0) {
            if (/not a git repository/i.test(result.stderr ?? '')) {
                // A project without version control is a valid state, not an error.
                return { changedFiles: [] };
            }
            const detail = result.stderr?.trim();
            throw new Error(detail ? detail : `git status failed with exit code ${result.status}`);
        }
        const changedFiles = (result.stdout ?? '')
            .split('\n')
            .filter(Boolean)
            .map(parseGitStatusPath);
        return { changedFiles };
    }
}

function parseGitStatusPath(line: string): string {
    // Strip the two status columns and the separator (e.g. `?? path`, ` M path`).
    let rest = line.slice(3).trim();
    // Renames/copies are emitted as `old -> new`; consumers care about the new path.
    const arrow = rest.indexOf(' -> ');
    if (arrow >= 0) {
        rest = rest.slice(arrow + 4);
    }
    // git quotes paths containing special characters.
    if (rest.startsWith('"') && rest.endsWith('"')) {
        rest = rest.slice(1, -1);
    }
    return rest;
}

async function copyRecursive(source: string, target: string): Promise<void> {
    const stat = await fs.stat(source);
    if (stat.isDirectory()) {
        await fs.mkdir(target, { recursive: true });
        const entries = await fs.readdir(source);
        for (const entry of entries) {
            await copyRecursive(path.join(source, entry), path.join(target, entry));
        }
        return;
    }
    await fs.copyFile(source, target);
}

/**
 * Heuristic detection of binary content: NUL bytes and other control characters
 * (except tab/newline/carriage-return) indicate binary data.
 */
function isTextContent(buffer: Buffer): boolean {
    const checkLength = Math.min(512, buffer.length);
    for (let i = 0; i < checkLength; i++) {
        const byte = buffer[i];
        if (byte === undefined) {
            return false;
        }
        if (byte === 0) {
            return false;
        }
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
            return false;
        }
    }
    return true;
}

export class NodeFsFileWatcher extends ProviderFileWatcher {
    private readonly watchers = new Map<string, FSWatcher>();
    private readonly timeouts = new Map<string, NodeJS.Timeout>();
    private readonly callbacks: Array<(event: WatchEvent) => Promise<void>> = [];
    private basePath = '';
    private excludes: string[] = [];
    private recursive = true;
    private stopped = true;

    constructor(private readonly rootDir: string) {
        super();
    }

    async start(input: WatchFilesInput): Promise<void> {
        this.basePath = path.normalize(path.join(this.rootDir, input.args.path));
        this.excludes = input.args.excludes ?? [];
        this.recursive = input.args.recursive ?? true;
        this.stopped = false;
        await this.watchDirectory(this.basePath);
    }

    registerEventCallback(callback: (event: WatchEvent) => Promise<void>): void {
        this.callbacks.push(callback);
    }

    async stop(): Promise<void> {
        this.stopped = true;
        for (const timeout of this.timeouts.values()) {
            clearTimeout(timeout);
        }
        this.timeouts.clear();
        for (const watcher of this.watchers.values()) {
            watcher.close();
        }
        this.watchers.clear();
        this.callbacks.length = 0;
    }

    private shouldExclude(relativePath: string): boolean {
        return this.excludes.some((pattern) => {
            const normalized = pattern.replace(/\/$/, '');
            if (normalized === '**') {
                return true;
            }
            return relativePath === normalized || relativePath.startsWith(normalized + '/');
        });
    }

    private async watchDirectory(dirPath: string): Promise<void> {
        if (this.stopped || this.watchers.has(dirPath)) {
            return;
        }
        const relative = path.relative(this.rootDir, dirPath).split(path.sep).join('/');
        if (relative && this.shouldExclude(relative)) {
            return;
        }

        const watcher = watch(dirPath, (eventType, filename) => {
            void this.handleEvent(dirPath, eventType, filename);
        });
        this.watchers.set(dirPath, watcher);

        if (!this.recursive) {
            return;
        }
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    await this.watchDirectory(path.join(dirPath, entry.name));
                }
            }
        } catch {
            // The directory may have been removed mid-walk; the event loop will handle it.
        }
    }

    private async handleEvent(
        dirPath: string,
        eventType: string,
        filename: string | null,
    ): Promise<void> {
        if (!filename) {
            return;
        }
        const fullPath = path.join(dirPath, filename.toString());
        const relative = path.relative(this.rootDir, fullPath).split(path.sep).join('/');
        if (this.shouldExclude(relative)) {
            return;
        }
        const sandboxPath = '/' + relative;

        const existing = this.timeouts.get(sandboxPath);
        if (existing) {
            clearTimeout(existing);
        }

        const timeout = setTimeout(() => {
            this.timeouts.delete(sandboxPath);
            void this.dispatch(dirPath, eventType, fullPath, sandboxPath);
        }, 50);
        this.timeouts.set(sandboxPath, timeout);
    }

    private async dispatch(
        dirPath: string,
        eventType: string,
        fullPath: string,
        sandboxPath: string,
    ): Promise<void> {
        if (this.stopped) {
            return;
        }
        if (eventType === 'rename') {
            try {
                const stat = await fs.stat(fullPath);
                if (stat.isDirectory() && this.recursive) {
                    await this.watchDirectory(fullPath);
                }
                await this.emit({ type: 'add', paths: [sandboxPath] });
            } catch {
                await this.emit({ type: 'remove', paths: [sandboxPath] });
            }
            return;
        }
        await this.emit({ type: 'change', paths: [sandboxPath] });
    }

    private async emit(event: WatchEvent): Promise<void> {
        for (const callback of this.callbacks) {
            try {
                await callback(event);
            } catch (error) {
                console.error('[NodeFsFileWatcher] callback error', error);
            }
        }
    }
}

export class NodeFsTerminal extends ProviderTerminal {
    private readonly _id: string;
    private readonly child: ChildProcess;
    private readonly outputCallbacks = new Set<(data: string) => void>();

    constructor(shell: string, cwd: string, registerProcess?: (child: ChildProcess) => void) {
        super();
        this._id = randomUUID();
        this.child = spawn(shell, [], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
        registerProcess?.(this.child);
        this.child.stdout?.on('data', (chunk: Buffer) => this.emit(chunk.toString()));
        this.child.stderr?.on('data', (chunk: Buffer) => this.emit(chunk.toString()));
        this.child.on('error', (error) => this.emit(`[terminal error] ${error.message}\n`));
        // The shell may exit while we still hold the stdin handle (EPIPE);
        // writes to a dead stdin are deliberately ignored.
        this.child.stdin?.on('error', () => {
            // no-op: EPIPE after shell exit is expected
        });
    }

    get id(): string {
        return this._id;
    }

    private readonly _name = 'local-shell';

    get name(): string {
        return this._name;
    }

    open(): Promise<string> {
        return Promise.resolve('');
    }

    write(input: string): Promise<void> {
        this.child.stdin?.write(input);
        return Promise.resolve();
    }

    run(input: string): Promise<void> {
        this.child.stdin?.write(input.endsWith('\n') ? input : input + '\n');
        return Promise.resolve();
    }

    kill(): Promise<void> {
        if (!this.child.killed) {
            this.child.kill('SIGTERM');
        }
        return Promise.resolve();
    }

    onOutput(callback: (data: string) => void): () => void {
        this.outputCallbacks.add(callback);
        return () => {
            this.outputCallbacks.delete(callback);
        };
    }

    private emit(data: string): void {
        for (const callback of this.outputCallbacks) {
            callback(data);
        }
    }
}

export class NodeFsTask extends ProviderTask {
    private readonly _id: string;
    private readonly _name: string;
    private readonly _command: string;
    private readonly shell: string;
    private readonly cwd: string;
    private readonly registerProcess?: (child: ChildProcess) => void;
    private readonly outputCallbacks = new Set<(data: string) => void>();
    private child: ChildProcess | null = null;

    constructor(
        id: string,
        name: string,
        command: string,
        shell: string,
        cwd: string,
        registerProcess?: (child: ChildProcess) => void,
    ) {
        super();
        this._id = id;
        this._name = name;
        this._command = command;
        this.shell = shell;
        this.cwd = cwd;
        this.registerProcess = registerProcess;
    }

    get id(): string {
        return this._id;
    }

    get name(): string {
        return this._name;
    }

    get command(): string {
        return this._command;
    }

    open(): Promise<string> {
        return Promise.resolve('');
    }

    run(): Promise<void> {
        if (this.child && !this.child.killed) {
            this.child.kill('SIGTERM');
        }
        const child = spawn(this.shell, shellArgs(this.shell, this._command), {
            cwd: this.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.child = child;
        this.registerProcess?.(child);
        child.stdout?.on('data', (chunk: Buffer) => this.emit(chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => this.emit(chunk.toString()));
        child.on('error', (error) => this.emit(`[task error] ${error.message}\n`));
        child.on('close', () => this.emit(`[task exited]\n`));
        return Promise.resolve();
    }

    async restart(): Promise<void> {
        await this.stop();
        await this.run();
    }

    stop(): Promise<void> {
        if (this.child && !this.child.killed) {
            this.child.kill('SIGTERM');
        }
        return Promise.resolve();
    }

    onOutput(callback: (data: string) => void): () => void {
        this.outputCallbacks.add(callback);
        return () => {
            this.outputCallbacks.delete(callback);
        };
    }

    private emit(data: string): void {
        for (const callback of this.outputCallbacks) {
            callback(data);
        }
    }
}

export class NodeFsCommand extends ProviderBackgroundCommand {
    private readonly _command: string;
    private readonly shell: string;
    private readonly cwd: string;
    private readonly registerProcess?: (child: ChildProcess) => void;
    private readonly outputCallbacks = new Set<(data: string) => void>();
    private child: ChildProcess | null = null;

    constructor(
        command: string,
        shell: string,
        cwd: string,
        registerProcess?: (child: ChildProcess) => void,
    ) {
        super();
        this._command = command;
        this.shell = shell;
        this.cwd = cwd;
        this.registerProcess = registerProcess;
    }

    get name(): string | undefined {
        return this._command.split(/\s+/)[0];
    }

    get command(): string {
        return this._command;
    }

    open(): Promise<string> {
        this.spawnChild();
        return Promise.resolve('');
    }

    async restart(): Promise<void> {
        await this.kill();
        this.spawnChild();
    }

    kill(): Promise<void> {
        if (this.child && !this.child.killed) {
            this.child.kill('SIGTERM');
        }
        return Promise.resolve();
    }

    onOutput(callback: (data: string) => void): () => void {
        this.outputCallbacks.add(callback);
        return () => {
            this.outputCallbacks.delete(callback);
        };
    }

    private spawnChild(): void {
        if (this.child && !this.child.killed) {
            this.child.kill('SIGTERM');
        }
        const child = spawn(this.shell, shellArgs(this.shell, this._command), {
            cwd: this.cwd,
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        this.child = child;
        this.registerProcess?.(child);
        child.stdout?.on('data', (chunk: Buffer) => this.emit(chunk.toString()));
        child.stderr?.on('data', (chunk: Buffer) => this.emit(chunk.toString()));
        child.on('error', (error) => this.emit(`[command error] ${error.message}\n`));
        child.on('close', () => this.emit(`[command exited]\n`));
    }

    private emit(data: string): void {
        for (const callback of this.outputCallbacks) {
            callback(data);
        }
    }
}

function shellArgs(shell: string, command: string): string[] {
    return shell === 'cmd.exe' ? ['/c', command] : ['-c', command];
}
