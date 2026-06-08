import OpenAI from 'openai';
import { AIProviderAdapter, GenerateOptions, StreamChunk } from './AIProvider';
import { getProxyAgent } from '../utils/ProxyAgent';

export class OpenAIProvider implements AIProviderAdapter {
  readonly name = 'openai';
  readonly supportsStreaming = true;

  async generate(opts: GenerateOptions): Promise<string> {
    const client = new OpenAI({ apiKey: opts.apiKey, timeout: opts.timeout, httpAgent: getProxyAgent('https://api.openai.com') });
    const isO1 = opts.model.startsWith('o1');
    const messages: OpenAI.ChatCompletionMessageParam[] = isO1
      ? [{ role: 'user', content: `${opts.system}\n\n${opts.user}` }]
      : [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }];
    const resp = await client.chat.completions.create(
      { model: opts.model, max_tokens: isO1 ? undefined : (opts.maxTokens ?? 8192), messages },
      { signal: opts.signal }
    );
    const text = resp.choices[0]?.message?.content;
    if (!text) throw new Error('OpenAI returned empty response.');
    return text;
  }

  async *generateStream(opts: GenerateOptions): AsyncIterable<StreamChunk> {
    const client = new OpenAI({ apiKey: opts.apiKey, timeout: opts.timeout, httpAgent: getProxyAgent('https://api.openai.com') });
    const isO1 = opts.model.startsWith('o1');
    const messages: OpenAI.ChatCompletionMessageParam[] = isO1
      ? [{ role: 'user', content: `${opts.system}\n\n${opts.user}` }]
      : [{ role: 'system', content: opts.system }, { role: 'user', content: opts.user }];
    const stream = await client.chat.completions.create(
      { model: opts.model, max_tokens: isO1 ? undefined : (opts.maxTokens ?? 8192), messages, stream: true },
      { signal: opts.signal }
    );
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) yield { text: delta, done: false };
    }
    yield { text: '', done: true };
  }
}
