import OpenAI from 'openai';
import { AIProviderAdapter, GenerateOptions, StreamChunk } from './AIProvider';
import { getProxyAgent } from '../utils/ProxyAgent';

export class OpenRouterProvider implements AIProviderAdapter {
  readonly name = 'openrouter';
  readonly supportsStreaming = true;

  private createClient(apiKey: string, timeout: number): OpenAI {
    return new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      timeout,
      httpAgent: getProxyAgent('https://openrouter.ai/api/v1'),
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/langshift/langshift-vscode',
        'X-Title': 'LangShift VSCode Extension',
      },
    });
  }

  async generate(opts: GenerateOptions): Promise<string> {
    const client = this.createClient(opts.apiKey, opts.timeout);
    const resp = await client.chat.completions.create(
      { model: opts.model, max_tokens: opts.maxTokens ?? 8192, messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }] },
      { signal: opts.signal }
    );
    const text = resp.choices[0]?.message?.content;
    if (!text) throw new Error('OpenRouter returned empty response.');
    return text;
  }

  async *generateStream(opts: GenerateOptions): AsyncIterable<StreamChunk> {
    const client = this.createClient(opts.apiKey, opts.timeout);
    const stream = await client.chat.completions.create(
      { model: opts.model, max_tokens: opts.maxTokens ?? 8192, messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }], stream: true },
      { signal: opts.signal }
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield { text: delta, done: false };
    }
    yield { text: '', done: true };
  }
}
