import type { LanguageModel } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import type { InitialModelPayload, ModelConfig } from '@onlook/models';
import { getModelMaxTokens, LLMProvider, OPENROUTER_MODELS } from '@onlook/models';
import { assertNever } from '@onlook/utility';

/**
 * Provider-agnostic AI configuration. When `baseURL` is set, the AI client bypasses
 * the default provider and targets any OpenAI- or Anthropic-compatible endpoint
 * (Ollama, LM Studio, Groq, DeepSeek, vLLM, ...).
 */
export interface CustomAIConfig {
    baseURL?: string;
    apiKey?: string;
    modelName?: string;
}

/**
 * Reads the provider-agnostic AI configuration from the environment.
 * Priority: `CUSTOM_AI_*` env vars, then the existing application configuration.
 * Empty values are treated as unset so the historical behavior is preserved when
 * no custom configuration is provided.
 */
export function getCustomAIConfig(): CustomAIConfig {
    const config: CustomAIConfig = {};
    if (process.env.CUSTOM_AI_BASE_URL) {
        config.baseURL = process.env.CUSTOM_AI_BASE_URL;
    }
    if (process.env.CUSTOM_AI_API_KEY) {
        config.apiKey = process.env.CUSTOM_AI_API_KEY;
    }
    if (process.env.CUSTOM_AI_MODEL_NAME) {
        config.modelName = process.env.CUSTOM_AI_MODEL_NAME;
    }
    return config;
}

export function initModel({
    provider: requestedProvider,
    model: requestedModel,
}: InitialModelPayload): ModelConfig {
    const customConfig = getCustomAIConfig();

    // A custom endpoint means the whole model stack (chat, edit, suggestions,
    // titles, ...) runs through that provider. The selected model name is sent
    // verbatim to the endpoint.
    if (customConfig.baseURL) {
        const customModelName = customConfig.modelName ?? requestedModel;
        return getCustomProvider(customConfig.baseURL, customConfig, customModelName);
    }

    // The user's selected model (Settings → AI & Models) personalizes the
    // default OpenRouter flow too: it overrides the per-chat-type default
    // (gpt-5 / claude-sonnet-4.5 / gpt-5-nano) everywhere, while leaving the
    // behavior untouched when nothing is configured.
    const effectiveModel = customConfig.modelName ?? requestedModel;

    let model: LanguageModel;
    let providerOptions: Record<string, any> | undefined;
    let headers: Record<string, string> | undefined;
    let maxOutputTokens: number = getModelMaxTokens(effectiveModel);

    switch (requestedProvider) {
        case LLMProvider.OPENROUTER:
            model = getOpenRouterProvider(effectiveModel);
            headers = {
                'HTTP-Referer': 'https://onlook.com',
                'X-Title': 'Onlook',
            };
            providerOptions = {
                openrouter: { transforms: ['middle-out'] },
            };
            const isAnthropic =
                effectiveModel === OPENROUTER_MODELS.CLAUDE_4_5_SONNET ||
                effectiveModel === OPENROUTER_MODELS.CLAUDE_3_5_HAIKU;
            providerOptions = isAnthropic
                ? { ...providerOptions, anthropic: { cacheControl: { type: 'ephemeral' } } }
                : providerOptions;
            break;
        default:
            assertNever(requestedProvider);
    }

    return {
        model,
        providerOptions,
        headers,
        maxOutputTokens,
    };
}

/**
 * Builds a model client for a custom, provider-agnostic endpoint.
 *
 * - `CUSTOM_AI_API_KEY` is used as the API key; local endpoints that don't require
 *   auth (Ollama, LM Studio, ...) work with an empty key.
 * - `CUSTOM_AI_MODEL_NAME` (or the requested default model) is sent verbatim to the
 *   provider, so any model identifier works (e.g. `deepseek-chat`, `llama3`).
 * - Endpoints are assumed to speak the OpenAI chat-completions wire format unless the
 *   base URL looks like an Anthropic endpoint, in which case the Anthropic format is used.
 */
function getCustomProvider(
    baseURL: string,
    config: CustomAIConfig,
    modelName: string,
): ModelConfig {
    const apiKey = config.apiKey ?? '';
    const isAnthropicStyle = /anthropic/i.test(baseURL);
    const client = isAnthropicStyle
        ? createAnthropic({ baseURL, apiKey })
        : createOpenAI({ baseURL, apiKey });

    return {
        model: client(modelName),
        maxOutputTokens: getModelMaxTokens(modelName),
    };
}

function getOpenRouterProvider(model: string): LanguageModel {
    if (!process.env.OPENROUTER_API_KEY) {
        throw new Error('OPENROUTER_API_KEY must be set');
    }
    const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
    return openrouter(model as never);
}
