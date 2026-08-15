import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import type { AiConfig, AiConfigInput } from './shared';

/**
 * The AI configuration file location shared by every consumer of the desktop
 * runtime: the Electron main process (owner), the dev launcher and the web
 * server (which reads it through `CUSTOM_AI_CONFIG_FILE`).
 *
 * A stable, home-based path is used instead of `app.getPath('userData')` so
 * the path is identical in dev and packaged runs and can be computed outside
 * Electron (e.g. by `scripts/dev.mjs`).
 */
export function resolveAiConfigPath(): string {
    return path.join(homedir(), '.onlook', 'ai-config.json');
}

export function readAiConfig(filePath: string = resolveAiConfigPath()): AiConfig {
    try {
        const raw = readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const config: AiConfig = { exists: true };
        if (typeof parsed.baseURL === 'string' && parsed.baseURL) {
            config.baseURL = parsed.baseURL;
        }
        if (typeof parsed.apiKey === 'string' && parsed.apiKey) {
            config.apiKey = parsed.apiKey;
        }
        if (typeof parsed.modelName === 'string' && parsed.modelName) {
            config.modelName = parsed.modelName;
        }
        if (Array.isArray(parsed.models)) {
            config.models = parsed.models.filter(
                (model): model is string => typeof model === 'string' && model.length > 0,
            );
        }
        return config;
    } catch {
        return { exists: false };
    }
}

export function writeAiConfig(input: AiConfigInput, filePath: string = resolveAiConfigPath()): AiConfig {
    // Empty strings are dropped so the JSON file only carries real values.
    const config: AiConfigInput = {};
    if (input.baseURL?.trim()) {
        config.baseURL = input.baseURL.trim();
    }
    if (input.apiKey?.trim()) {
        config.apiKey = input.apiKey.trim();
    }
    if (input.modelName?.trim()) {
        config.modelName = input.modelName.trim();
    }
    if (Array.isArray(input.models)) {
        const seen = new Set<string>();
        config.models = input.models
            .map((model) => model.trim())
            .filter((model) => model.length > 0 && !seen.has(model) && seen.add(model));
    }

    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(config, null, 4), 'utf-8');
    return { ...config, exists: true };
}
