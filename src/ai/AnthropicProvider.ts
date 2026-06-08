import Anthropic from '@anthropic-ai/sdk';
import { AIProviderAdapter, GenerateOptions, StreamChunk } from './AIProvider';
import { getProxyAgent } from '../utils/ProxyAgent';

export class AnthropicProvider implements AIProviderAdapter {
  readonly name = 'anthropic';
  readonly supportsStreaming = true;

  async generate(opts: GenerateOptions): Promise<string> {
    const client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeout, httpAgent: getProxyAgent('https://api.anthropic.com') });
    const resp = await client.messages.create(
      { model: opts.model, max_tokens: opts.maxTokens ?? 8192, system: opts.system, messages: [{ role: 'user', content: opts.user }] },
      { signal: opts.signal }
    );
    const block = resp.content[0];
    if (block.type !== 'text') throw new Error('Anthropic returned non-text block.');
    return block.text;
  }

  async *generateStream(opts: GenerateOptions): AsyncIterable<StreamChunk> {
    const client = new Anthropic({ apiKey: opts.apiKey, timeout: opts.timeout, httpAgent: getProxyAgent('https://api.anthropic.com') });
    const stream = client.messages.stream(
      { model: opts.model, max_tokens: opts.maxTokens ?? 8192, system: opts.system, messages: [{ role: 'user', content: opts.user }] },
      { signal: opts.signal }
    );
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield { text: event.delta.text, done: false };
      }
    }
    yield { text: '', done: true };
  }
}
