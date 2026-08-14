'use client';

import { useEffect, useState } from 'react';

import type { Project } from '@onlook/models';
import { getDesktopApi } from '@onlook/models';

import { api } from '@/trpc/react';

/** Shape returned by {@link useProjects}, mirroring the tRPC query surface. */
export interface ProjectsQuery {
    data: Project[] | null | undefined;
    isLoading: boolean;
    refetch: () => Promise<unknown>;
}

/**
 * Project data source that adapts to the runtime:
 *
 * - Inside the Onlook Desktop renderer (`window.onlook` present), projects
 *   are listed from the local store through the desktop bridge.
 * - In a plain browser (web app served over HTTP), it falls back to the
 *   cloud tRPC path — behavior is strictly identical to before.
 *
 * The tRPC query is always declared (hook rules) but disabled on desktop so
 * no cloud request is made; the local list loads through the bridge instead.
 */
export function useProjects(): ProjectsQuery {
    const desktopApi = getDesktopApi();

    const {
        data: cloudProjects,
        isLoading: cloudLoading,
        refetch: cloudRefetch,
    } = api.project.list.useQuery(undefined, { enabled: desktopApi === null });

    const [localProjects, setLocalProjects] = useState<Project[] | null>(null);

    useEffect(() => {
        if (!desktopApi) {
            return;
        }
        let cancelled = false;
        setLocalProjects(null);
        void desktopApi
            .projectsList()
            .then((result) => {
                if (cancelled) {
                    return;
                }
                setLocalProjects(result.ok ? result.value : []);
            })
            .catch(() => {
                if (!cancelled) {
                    setLocalProjects([]);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [desktopApi]);

    if (desktopApi) {
        return {
            data: localProjects,
            isLoading: localProjects === null,
            refetch: async () => {
                if (!desktopApi) {
                    return;
                }
                const result = await desktopApi.projectsList();
                setLocalProjects(result.ok ? result.value : []);
            },
        };
    }

    return { data: cloudProjects, isLoading: cloudLoading, refetch: cloudRefetch };
}
