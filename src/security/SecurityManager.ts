import * as vscode from 'vscode';
import { AIProvider, ConfigManager } from '../utils/ConfigManager';

const SVC = 'langshift-vscode';

// One secret-storage key per provider (local providers don't need keys)
const PROVIDER_KEYS: Partial<Record<AIProvider, string>> = {
  anthropic:   `${SVC}.anthropic-key`,
  openai:      `${SVC}.openai-key`,
  gemini:      `${SVC}.gemini-key`,
  openrouter:  `${SVC}.openrouter-key`,
};

/** Providers that run locally and don't require API keys */
const LOCAL_PROVIDERS = new Set<AIProvider>(['ollama', 'lmstudio']);

interface ProviderMeta {
  label: string;
  placeholder: string;
  hint: string;
  validate: (key: string) => string | null;  // null = valid, string = error
}

const PROVIDER_META: Record<AIProvider, ProviderMeta> = {
  anthropic: {
    label:       '🟣 Anthropic (Claude)',
    placeholder: 'sk-ant-api03-…',
    hint:        'console.anthropic.com → API Keys',
    validate: (k) => k.startsWith('sk-ant-') ? null : 'Anthropic keys start with sk-ant-',
  },
  openai: {
    label:       '🟢 OpenAI (GPT-4o)',
    placeholder: 'sk-proj-… or sk-…',
    hint:        'platform.openai.com/api-keys',
    validate: (k) => k.startsWith('sk-') ? null : 'OpenAI keys start with sk-',
  },
  gemini: {
    label:       '🔵 Google Gemini',
    placeholder: 'AIza…',
    hint:        'aistudio.google.com/app/apikey',
    validate: (k) => k.startsWith('AIza') && k.length >= 30 ? null : 'Gemini keys start with AIza and are at least 30 characters',
  },
  openrouter: {
    label:       '🟡 OpenRouter (200+ models)',
    placeholder: 'sk-or-v1-…',
    hint:        'openrouter.ai/keys',
    validate: (k) => k.startsWith('sk-or-') ? null : 'OpenRouter keys start with sk-or-',
  },
  ollama: {
    label:       '🟤 Ollama (Local AI)',
    placeholder: 'http://localhost:11434',
    hint:        'No API key needed — runs locally via Ollama',
    validate: () => null,
  },
  lmstudio: {
    label:       '⚪ LM Studio (Local AI)',
    placeholder: 'http://localhost:1234',
    hint:        'No API key needed — runs locally via LM Studio',
    validate: () => null,
  },
};

export class SecurityManager {
  constructor(private context: vscode.ExtensionContext) {}

  // Returns the stored key for the CURRENTLY configured provider.
  // For local providers, returns the base URL instead.
  async getApiKey(provider?: AIProvider): Promise<string | null> {
    const p = provider ?? ConfigManager.getConfig().aiProvider;

    // Local providers: return the base URL (used as connection endpoint)
    if (LOCAL_PROVIDERS.has(p)) {
      const config = ConfigManager.getConfig();
      if (p === 'ollama') return config.ollamaBaseUrl;
      if (p === 'lmstudio') return config.lmstudioBaseUrl;
    }

    const secretKey = PROVIDER_KEYS[p];
    if (!secretKey) return null;

    try {
      return await this.context.secrets.get(secretKey) ?? null;
    } catch {
      return null;
    }
  }

  async hasApiKey(provider?: AIProvider): Promise<boolean> {
    const p = provider ?? ConfigManager.getConfig().aiProvider;

    // Local providers always "have a key"
    if (LOCAL_PROVIDERS.has(p)) return true;

    const key = await this.getApiKey(p);
    return !!key && key.trim().length >= 20;
  }

  async storeApiKey(provider: AIProvider, rawKey: string): Promise<void> {
    // Local providers don't store keys
    if (LOCAL_PROVIDERS.has(provider)) return;

    const key = rawKey.trim();
    if (!key) throw new Error('API key cannot be empty.');
    if (key.includes(' ')) throw new Error('API key must not contain spaces.');

    const meta = PROVIDER_META[provider];
    const err = meta.validate(key);
    if (err) throw new Error(err);

    const secretKey = PROVIDER_KEYS[provider];
    if (!secretKey) throw new Error(`No secret storage key defined for ${provider}.`);

    await this.context.secrets.store(secretKey, key);
  }

  async deleteApiKey(provider: AIProvider): Promise<void> {
    const secretKey = PROVIDER_KEYS[provider];
    if (secretKey) {
      await this.context.secrets.delete(secretKey);
    }
  }

  // Full interactive flow: pick provider → enter key → validate → save
  async promptAndStoreApiKey(): Promise<boolean> {
    // Step 1 — pick provider
    const choices = (Object.keys(PROVIDER_META) as AIProvider[]).map((p) => ({
      label:       PROVIDER_META[p].label,
      description: p === ConfigManager.getConfig().aiProvider
        ? '(currently selected)'
        : LOCAL_PROVIDERS.has(p) ? '(no API key needed)' : '',
      provider:    p,
    }));

    const picked = await vscode.window.showQuickPick(choices, {
      title:       'LangShift › Configure API Key — Step 1 of 2',
      placeHolder: 'Select AI provider',
    });
    if (!picked) return false;

    const provider = picked.provider;
    const meta = PROVIDER_META[provider];

    // Local providers: just switch, no key needed
    if (LOCAL_PROVIDERS.has(provider)) {
      await ConfigManager.update('aiProvider', provider);
      vscode.window.showInformationMessage(
        `✅ LangShift: Switched to ${meta.label}. Make sure the server is running.`
      );
      return true;
    }

    // Step 2 — enter key
    const rawKey = await vscode.window.showInputBox({
      title:         `LangShift › ${meta.label} API Key — Step 2 of 2`,
      prompt:        meta.hint,
      placeHolder:   meta.placeholder,
      password:      true,
      ignoreFocusOut: true,
      validateInput: (v) => {
        if (!v || v.trim().length < 10) return 'Key is too short.';
        return meta.validate(v.trim());
      },
    });
    if (!rawKey) return false;

    try {
      await this.storeApiKey(provider, rawKey);
      // Also update the active provider setting
      await ConfigManager.update('aiProvider', provider);
      vscode.window.showInformationMessage(
        `✅ LangShift: ${meta.label} key saved. Provider switched to ${provider}.`
      );
      return true;
    } catch (e: any) {
      vscode.window.showErrorMessage(`❌ LangShift: ${e.message}`);
      return false;
    }
  }

  // Show a menu to delete any stored key
  async promptDeleteApiKey(): Promise<void> {
    const cloudProviders = (Object.keys(PROVIDER_META) as AIProvider[]).filter(p => !LOCAL_PROVIDERS.has(p));
    const items = await Promise.all(
      cloudProviders.map(async (p) => ({
        label:       PROVIDER_META[p].label,
        description: (await this.hasApiKey(p)) ? '✓ stored' : 'not set',
        provider:    p,
      }))
    );

    const picked = await vscode.window.showQuickPick(items, {
      title:       'LangShift › Delete API Key',
      placeHolder: 'Which provider key do you want to delete?',
    });
    if (!picked) return;

    const confirm = await vscode.window.showWarningMessage(
      `Delete ${PROVIDER_META[picked.provider].label} API key?`,
      { modal: true },
      'Delete'
    );
    if (confirm === 'Delete') {
      await this.deleteApiKey(picked.provider);
      vscode.window.showInformationMessage(`✅ LangShift: ${PROVIDER_META[picked.provider].label} key deleted.`);
    }
  }

  /** Check if a provider is local (no API key, no data sent externally) */
  static isLocal(provider: AIProvider): boolean {
    return LOCAL_PROVIDERS.has(provider);
  }

  // Warn if code contains obvious secrets (no mutation, just advisory)
  static scanForSecrets(code: string): string[] {
    const warnings: string[] = [];
    const patterns: [RegExp, string][] = [
      [/password\s*[:=]\s*["'][^"']{4,}["']/gi,         'hardcoded password'],
      [/api[_-]?key\s*[:=]\s*["'][^"']{10,}["']/gi,     'hardcoded API key'],
      [/secret\s*[:=]\s*["'][^"']{8,}["']/gi,           'hardcoded secret'],
      [/token\s*[:=]\s*["'][^"']{10,}["']/gi,           'hardcoded token'],
      [/sk-(ant|proj|or)-[A-Za-z0-9_-]{20,}/g,          'embedded provider key'],
      [/AIza[0-9A-Za-z\-_]{35}/g,                       'embedded Gemini key'],
      [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,                'embedded AWS key'],
    ];
    for (const [rx, label] of patterns) {
      rx.lastIndex = 0;
      if (rx.test(code)) warnings.push(`Possible ${label} detected in source`);
    }
    return warnings;
  }
}
