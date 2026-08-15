'use client';

import { useEffect, useState } from 'react';
import { getDesktopApi, OPENROUTER_MODELS } from '@onlook/models';
import type { AiConfig, AiConfigInput } from '@onlook/models';
import { Button } from '@onlook/ui/button';
import { Icons } from '@onlook/ui/icons';
import { Input } from '@onlook/ui/input';
import { Label } from '@onlook/ui/label';
import { Separator } from '@onlook/ui/separator';
import { cn } from '@onlook/ui/utils';

type ProviderMode = 'openrouter' | 'openai' | 'anthropic';

const PROVIDER_MODES: Array<{
    value: ProviderMode;
    label: string;
    description: string;
}> = [
    {
        value: 'openrouter',
        label: 'OpenRouter',
        description: 'Default cloud provider with the built-in model catalog.',
    },
    {
        value: 'openai',
        label: 'OpenAI-compatible',
        description: 'Any endpoint speaking the OpenAI wire format (Ollama, LM Studio, DeepSeek, Groq…).',
    },
    {
        value: 'anthropic',
        label: 'Anthropic-compatible',
        description: 'Any endpoint speaking the Anthropic Messages format.',
    },
];

const BUILT_IN_MODELS = Object.values(OPENROUTER_MODELS);

function modeFromConfig(config: AiConfig): ProviderMode {
    if (config.baseURL) {
        return /anthropic/i.test(config.baseURL) ? 'anthropic' : 'openai';
    }
    return 'openrouter';
}

export const AiSettingsTab = () => {
    const desktopApi = getDesktopApi();

    const [mode, setMode] = useState<ProviderMode>('openrouter');
    const [baseURL, setBaseURL] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [modelName, setModelName] = useState('');
    const [configPath, setConfigPath] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (!desktopApi) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        void Promise.all([desktopApi.aiConfigGet(), desktopApi.aiConfigPath()])
            .then(([configResult, pathResult]) => {
                if (cancelled) {
                    return;
                }
                if (configResult.ok) {
                    const config = configResult.value;
                    setMode(modeFromConfig(config));
                    setBaseURL(config.baseURL ?? '');
                    setApiKey(config.apiKey ?? '');
                    setModelName(config.modelName ?? '');
                }
                if (pathResult.ok) {
                    setConfigPath(pathResult.value);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setStatus('error');
                    setErrorMessage('Could not read the local AI configuration.');
                }
            })
            .finally(() => {
                if (!cancelled) {
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [desktopApi]);

    const save = async () => {
        if (!desktopApi) {
            return;
        }
        setSaving(true);
        setStatus('idle');
        setErrorMessage(null);
        const useCustomEndpoint = mode !== 'openrouter';
        const input: AiConfigInput = {
            baseURL: useCustomEndpoint ? baseURL : '',
            apiKey: useCustomEndpoint ? apiKey : '',
            modelName,
        };
        const result = await desktopApi.aiConfigSet(input);
        setSaving(false);
        if (result.ok) {
            setStatus('saved');
        } else {
            setStatus('error');
            setErrorMessage(result.error);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
                <Icons.MagicWand className="mr-2 h-4 w-4 animate-pulse" />
                Loading AI configuration…
            </div>
        );
    }

    // Plain browser (cloud): no local config file to edit.
    if (!desktopApi) {
        return (
            <div className="flex flex-col gap-6 p-6">
                <div>
                    <h2 className="text-largePlus">AI &amp; Models</h2>
                    <p className="mt-1 text-small text-muted-foreground">
                        The cloud version reads the AI provider configuration from environment
                        variables. On the Onlook Desktop you can configure it here and it is saved
                        to a local file.
                    </p>
                </div>
                <div className="flex flex-col gap-3 rounded-md border p-4 text-small">
                    <p className="text-muted-foreground">Environment variables used:</p>
                    {['CUSTOM_AI_BASE_URL', 'CUSTOM_AI_API_KEY', 'CUSTOM_AI_MODEL_NAME'].map(
                        (name) => (
                            <code key={name} className="font-mono text-foreground">
                                {name}
                            </code>
                        ),
                    )}
                </div>
                <ModelCatalog />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 p-6">
            <div>
                <h2 className="text-largePlus">AI &amp; Models</h2>
                <p className="mt-1 text-small text-muted-foreground">
                    Choose your provider and model. Saved to the local config file and applied to
                    the next chat message — no restart needed.
                </p>
            </div>

            {/* Provider mode */}
            <div className="flex flex-col gap-2">
                <Label className="text-regularPlus">Provider</Label>
                <div className="grid grid-cols-1 gap-2">
                    {PROVIDER_MODES.map((provider) => (
                        <button
                            key={provider.value}
                            type="button"
                            onClick={() => setMode(provider.value)}
                            className={cn(
                                'flex flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors',
                                mode === provider.value
                                    ? 'border-active bg-background-secondary'
                                    : 'border hover:bg-background-hover',
                            )}
                        >
                            <span className="text-regularPlus">{provider.label}</span>
                            <span className="text-small text-muted-foreground">
                                {provider.description}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {mode !== 'openrouter' && (
                <>
                    <Separator />
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="ai-base-url">Base URL</Label>
                            <Input
                                id="ai-base-url"
                                type="url"
                                placeholder="http://localhost:11434/v1"
                                value={baseURL}
                                onChange={(e) => setBaseURL(e.target.value)}
                            />
                            <p className="text-micro text-muted-foreground">
                                Any OpenAI/Anthropic-compatible endpoint. For local servers,
                                http://localhost works.
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="ai-api-key">API key</Label>
                            <Input
                                id="ai-api-key"
                                type="password"
                                placeholder="sk-… (optional for local endpoints)"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="ai-model-name">Model name</Label>
                            <Input
                                id="ai-model-name"
                                placeholder="deepseek-chat, llama3, qwen2.5-coder…"
                                value={modelName}
                                onChange={(e) => setModelName(e.target.value)}
                            />
                            <p className="text-micro text-muted-foreground">
                                Sent verbatim to the provider — any model identifier works.
                            </p>
                        </div>
                    </div>
                </>
            )}

            {mode === 'openrouter' && (
                <div className="flex flex-col gap-2">
                    <Label htmlFor="ai-model-name">Default model name (optional)</Label>
                    <Input
                        id="ai-model-name"
                        placeholder="e.g. anthropic/claude-sonnet-4.5"
                        value={modelName}
                        onChange={(e) => setModelName(e.target.value)}
                    />
                    <p className="text-micro text-muted-foreground">
                        Only used when a custom endpoint is configured; OpenRouter uses the
                        built-in catalog otherwise.
                    </p>
                </div>
            )}

            <Separator />

            <div className="flex items-center gap-3">
                <Button onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save configuration'}
                </Button>
                {status === 'saved' && (
                    <span className="flex items-center gap-1 text-small text-foreground-positive">
                        <Icons.CheckCircled className="h-4 w-4" />
                        Saved
                    </span>
                )}
                {status === 'error' && (
                    <span className="flex items-center gap-1 text-small text-destructive">
                        <Icons.CrossCircled className="h-4 w-4" />
                        {errorMessage ?? 'Could not save the configuration.'}
                    </span>
                )}
            </div>

            {configPath && (
                <p className="text-micro text-muted-foreground">
                    Config file: <code className="font-mono">{configPath}</code>
                </p>
            )}

            <ModelCatalog />
        </div>
    );
};

const ModelCatalog = () => (
    <div className="flex flex-col gap-2">
        <p className="text-smallPlus text-muted-foreground">Built-in OpenRouter catalog</p>
        <div className="flex flex-wrap gap-1.5">
            {BUILT_IN_MODELS.map((model) => (
                <span
                    key={model}
                    className="rounded-full border px-2.5 py-1 text-micro font-mono text-muted-foreground"
                >
                    {model}
                </span>
            ))}
        </div>
    </div>
);
