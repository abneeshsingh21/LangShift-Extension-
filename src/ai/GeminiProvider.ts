import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProviderAdapter, GenerateOptions, StreamChunk } from './AIProvider';
import { applyProxyEnvironment } from '../utils/ProxyAgent';

export class GeminiProvider implements AIProviderAdapter {
  readonly name = 'gemini';
  readonly supportsStreaming = true;

  async generate(opts: GenerateOptions): Promise<string> {
    applyProxyEnvironment();
    const genAI = new GoogleGenerativeAI(opts.apiKey);
    const gemini = genAI.getGenerativeModel(
      { model: opts.model, systemInstruction: opts.system },
      { timeout: opts.timeout },
    );

    const result = await new Promise<Awaited<ReturnType<typeof gemini.generateContent>>>((resolve, reject) => {
      const signal = opts.signal;
      const id = setTimeout(() => { signal.removeEventListener('abort', onAbort); reject(new Error('Gemini request timed out.')); }, opts.timeout);
      const onAbort = () => { clearTimeout(id); reject(new DOMException('The operation was aborted', 'AbortError')); };
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
      gemini.generateContent(opts.user).then(
        (res) => { clearTimeout(id); signal.removeEventListener('abort', onAbort); resolve(res); },
        (err) => { clearTimeout(id); signal.removeEventListener('abort', onAbort); reject(err); }
      );
    });

    const text = result.response.text();
    if (!text) throw new Error('Gemini returned empty response.');
    return text;
  }

  async *generateStream(opts: GenerateOptions): AsyncIterable<StreamChunk> {
    applyProxyEnvironment();
    const genAI = new GoogleGenerativeAI(opts.apiKey);
    const gemini = genAI.getGenerativeModel(
      { model: opts.model, systemInstruction: opts.system },
      { timeout: opts.timeout },
    );
    const result = await gemini.generateContentStream(opts.user, { timeout: opts.timeout });
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield { text, done: false };
    }
    yield { text: '', done: true };
  }
}
