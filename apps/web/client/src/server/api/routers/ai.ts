import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const listModelsSchema = z.object({
    /** Base URL of the provider, e.g. `http://localhost:11434/v1`. */
    baseURL: z.string().min(1),
    /** API key. Optional for local endpoints (Ollama, LM Studio…). */
    apiKey: z.string().optional(),
    /** Wire format: `openai` (Bearer) or `anthropic` (x-api-key). */
    style: z.enum(['openai', 'anthropic']).optional(),
});

/**
 * AI configuration helpers for the Onlook Desktop.
 *
 * `listModels` proxies the provider's `/models` catalog through the server so
 * the renderer never hits CORS or exposes keys to arbitrary endpoints: the
 * settings UI passes the endpoint + key and receives the model ids.
 */
export const aiRouter = createTRPCRouter({
    listModels: protectedProcedure
        .input(listModelsSchema)
        .mutation(async ({ input }): Promise<{ models: string[] }> => {
            const style = input.style ?? (/anthropic/i.test(input.baseURL) ? 'anthropic' : 'openai');
            const baseURL = input.baseURL.trim().replace(/\/+$/, '');
            const headers: Record<string, string> = {};

            if (style === 'anthropic') {
                headers['x-api-key'] = input.apiKey?.trim() ?? '';
                headers['anthropic-version'] = '2023-06-01';
            } else if (input.apiKey?.trim()) {
                headers['Authorization'] = `Bearer ${input.apiKey.trim()}`;
            }

            const response = await fetch(`${baseURL}/models`, {
                headers,
                signal: AbortSignal.timeout(15_000),
            });

            if (!response.ok) {
                const detail = await response.text().catch(() => '');
                throw new Error(
                    `Model catalog request failed (${response.status})${
                        detail ? `: ${detail.slice(0, 200)}` : ''
                    }`,
                );
            }

            const body = (await response.json()) as {
                data?: Array<{ id?: string }>;
                models?: Array<{ id?: string }>;
            };
            const models = (body.data ?? body.models ?? [])
                .map((entry) => entry.id)
                .filter((id): id is string => typeof id === 'string' && id.length > 0)
                .sort((a, b) => a.localeCompare(b));

            return { models };
        }),
});
