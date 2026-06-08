/**
 * Abstract AI provider adapter interface.
 * All providers (cloud + local) implement this contract.
 */

export interface GenerateOptions {
  system: string;
  user: string;
  model: string;
  apiKey: string;
  timeout: number;
  signal: AbortSignal;
  maxTokens?: number;
}

export interface StreamChunk {
  text: string;
  done: boolean;
}

export interface AIProviderAdapter {
  readonly name: string;
  readonly supportsStreaming: boolean;

  /** Standard (non-streaming) generation */
  generate(opts: GenerateOptions): Promise<string>;

  /** Streaming generation — yields text chunks as they arrive */
  generateStream(opts: GenerateOptions): AsyncIterable<StreamChunk>;
}
