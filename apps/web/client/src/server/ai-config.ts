import { readFileSync } from 'node:fs';

/**
 * Server-only bridge between the Onlook Desktop config file and the AI layer.
 *
 * The Electron main process owns `~/.onlook/ai-config.json` (written by the
 * "AI & Models" settings tab) and points the embedded web server at it via
 * `CUSTOM_AI_CONFIG_FILE`. This module merges those values into `process.env`
 * so `@onlook/ai`'s existing `getCustomAIConfig()` picks them up without any
 * change to the AI packages (which must stay browser-safe).
 *
 * Rules:
 * - Explicit `CUSTOM_AI_*` environment variables always win over the file.
 * - The file is re-read on every LLM call, so settings saved in the UI apply
 *   to the next message without a restart.
 * - Clearing a field in the UI also clears the value we previously applied.
 * - Missing/unreadable file → no-op (cloud behavior unchanged).
 */
const FILE_TO_ENV: Array<['baseURL' | 'apiKey' | 'modelName', string]> = [
    ['baseURL', 'CUSTOM_AI_BASE_URL'],
    ['apiKey', 'CUSTOM_AI_API_KEY'],
    ['modelName', 'CUSTOM_AI_MODEL_NAME'],
];

const appliedFromFile = new Set<string>();

export function loadLocalAiConfig(): void {
    const filePath = process.env.CUSTOM_AI_CONFIG_FILE;
    if (!filePath) {
        return;
    }

    try {
        const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
        for (const [fileKey, envKey] of FILE_TO_ENV) {
            const fileValue = typeof parsed[fileKey] === 'string' ? (parsed[fileKey] as string) : undefined;
            if (fileValue && !process.env[envKey]) {
                process.env[envKey] = fileValue;
                appliedFromFile.add(envKey);
            } else if (!fileValue && appliedFromFile.has(envKey)) {
                delete process.env[envKey];
                appliedFromFile.delete(envKey);
            }
        }
    } catch {
        // Corrupt or unreadable config file: fall back to env-only behavior.
    }
}
