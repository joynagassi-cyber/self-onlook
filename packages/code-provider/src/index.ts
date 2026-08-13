import type { CodesandboxProviderOptions } from './providers/codesandbox';
import type { NodeFsProvider, NodeFsProviderOptions } from './providers/nodefs';
import { CodeProvider } from './providers';
import { CodesandboxProvider } from './providers/codesandbox';

export * from './providers';
export { CodesandboxProvider } from './providers/codesandbox';
export type { NodeFsProviderOptions } from './providers/nodefs';
export * from './types';

export interface CreateClientOptions {
    providerOptions: ProviderInstanceOptions;
}

/**
 * Providers are designed to be singletons; be mindful of this when creating multiple clients
 * or when instantiating in the backend (stateless vs stateful).
 */
export async function createCodeProviderClient(
    codeProvider: CodeProvider,
    { providerOptions }: CreateClientOptions,
) {
    const provider = newProviderInstance(codeProvider, providerOptions);
    await provider.initialize({});
    return provider;
}

export async function getStaticCodeProvider(
    codeProvider: CodeProvider,
): Promise<typeof CodesandboxProvider | typeof NodeFsProvider> {
    if (codeProvider === CodeProvider.CodeSandbox) {
        return CodesandboxProvider;
    }

    if (codeProvider === CodeProvider.NodeFs) {
        throw new Error(
            'NodeFsProvider is Node-only and is not exported from the package root. Import it from "@onlook/code-provider/providers/nodefs".',
        );
    }
    throw new Error(`Unimplemented code provider: ${codeProvider}`);
}

export interface ProviderInstanceOptions {
    codesandbox?: CodesandboxProviderOptions;
    nodefs?: NodeFsProviderOptions;
}

function newProviderInstance(codeProvider: CodeProvider, providerOptions: ProviderInstanceOptions) {
    if (codeProvider === CodeProvider.CodeSandbox) {
        if (!providerOptions.codesandbox) {
            throw new Error('Codesandbox provider options are required.');
        }
        return new CodesandboxProvider(providerOptions.codesandbox);
    }

    if (codeProvider === CodeProvider.NodeFs) {
        throw new Error(
            'NodeFsProvider is Node-only and cannot be created from the package root (it would pull Node builtins into the browser bundle). Construct it directly from "@onlook/code-provider/providers/nodefs".',
        );
    }

    throw new Error(`Unimplemented code provider: ${codeProvider}`);
}
