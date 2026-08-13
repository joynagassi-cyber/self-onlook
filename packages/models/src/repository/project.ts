import type { Canvas } from '../project/canvas';
import type { CreateRequestContext } from '../project/create';
import type { Frame } from '../project/frame';
import type { PreviewImg, Project } from '../project/project';
import type { ProjectRole } from '../project/role';

/**
 * A project with its default canvas state, as returned by the web app's
 * project detail flow (`getProjectWithCanvas`).
 */
export interface ProjectWithCanvas {
    project: Project;
    userCanvas: Canvas;
    frames: Frame[];
}

export interface ProjectListOptions {
    limit?: number;
    excludeProjectId?: string;
}

/**
 * Context of the original project creation request (prompt/image) that is
 * carried into the created project's record.
 */
export interface ProjectCreationData {
    context: CreateRequestContext[];
}

export interface CreateProjectInput {
    name: string;
    description?: string | null;
    tags?: string[];
    userId: string;
    /** Ownership role for the creating user. Defaults to OWNER. */
    role?: ProjectRole;
    /**
     * Sandbox backing the project's default branch. Required for
     * cloud-backed projects; local/desktop projects may omit it (the
     * `projects` table stores it as a deprecated, nullable column).
     */
    sandboxId?: string;
    sandboxUrl?: string;
    creationData?: ProjectCreationData;
}

export interface UpdateProjectInput {
    id: string;
    name?: string;
    description?: string | null;
    tags?: string[];
    previewImg?: PreviewImg | null;
}

export interface ProjectTagResult {
    success: boolean;
    tags: string[];
}

/**
 * Persistence boundary for projects, expressed purely in domain terms.
 *
 * The web runtime implements it over Postgres/Supabase (Drizzle); a desktop
 * runtime implements it over local storage (filesystem/SQLite). Consumers
 * depend on this interface, never on a concrete storage technology.
 *
 * Methods taking a `userId` are user-scoped: implementations must enforce
 * access (today: the `userProjects` membership check in the web app).
 */
export interface ProjectRepository {
    listByUser(userId: string, options?: ProjectListOptions): Promise<Project[]>;
    get(userId: string, projectId: string): Promise<Project | null>;
    getProjectWithCanvas(userId: string, projectId: string): Promise<ProjectWithCanvas | null>;
    hasAccess(userId: string, projectId: string): Promise<boolean>;
    create(input: CreateProjectInput): Promise<Project>;
    update(userId: string, input: UpdateProjectInput): Promise<Project>;
    delete(userId: string, projectId: string): Promise<void>;
    addTag(userId: string, projectId: string, tag: string): Promise<ProjectTagResult>;
    removeTag(userId: string, projectId: string, tag: string): Promise<ProjectTagResult>;
}
