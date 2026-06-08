import { AIProviderAdapter } from './AIProvider';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';
import { OpenRouterProvider } from './OpenRouterProvider';
import { OllamaProvider } from './OllamaProvider';
import { LMStudioProvider } from './LMStudioProvider';

type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama' | 'lmstudio';

const PROVIDERS: Record<ProviderName, () => AIProviderAdapter> = {
  anthropic:  () => new AnthropicProvider(),
  openai:     () => new OpenAIProvider(),
  gemini:     () => new GeminiProvider(),
  openrouter: () => new OpenRouterProvider(),
  ollama:     () => new OllamaProvider(),
  lmstudio:   () => new LMStudioProvider(),
};

// Cache instances
const cache = new Map<string, AIProviderAdapter>();

export class ProviderFactory {
  static get(name: ProviderName): AIProviderAdapter {
    let provider = cache.get(name);
    if (!provider) {
      const factory = PROVIDERS[name];
      if (!factory) throw new Error(`Unknown AI provider: ${name}`);
      provider = factory();
      cache.set(name, provider);
    }
    return provider;
  }

  static isLocal(name: string): boolean {
    return name === 'ollama' || name === 'lmstudio';
  }

  static allNames(): ProviderName[] {
    return Object.keys(PROVIDERS) as ProviderName[];
  }
}
