import OpenAI from 'openai';
import { AIProviderAdapter, GenerateOptions, StreamChunk } from './AIProvider';
import { getProxyAgent } from '../utils/ProxyAgent';

export class OllamaProvider implements AIProviderAdapter {
  readonly name = 'ollama';
  readonly supportsStreaming = true;

  private createClient(baseUrl: string, timeout: number): OpenAI {
    return new OpenAI({ apiKey: 'ollama', baseURL: baseUrl, timeout, httpAgent: getProxyAgent(baseUrl) });
  }

  async generate(opts: GenerateOptions): Promise<string> {
    const baseUrl = opts.apiKey || 'http://localhost:11434/v1';
    const client = this.createClient(baseUrl, opts.timeout);
    const resp = await client.chat.completions.create(
      { model: opts.model, messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }] },
      { signal: opts.signal }
    );
    const text = resp.choices[0]?.message?.content;
    if (!text) throw new Error('Ollama returned empty response. Is the model loaded?');
    return text;
  }

  async *generateStream(opts: GenerateOptions): AsyncIterable<StreamChunk> {
    const baseUrl = opts.apiKey || 'http://localhost:11434/v1';
    const client = this.createClient(baseUrl, opts.timeout);
    const stream = await client.chat.completions.create(
      { model: opts.model, messages: [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }], stream: true },
      { signal: opts.signal }
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield { text: delta, done: false };
    }
    yield { text: '', done: true };
  }
}
