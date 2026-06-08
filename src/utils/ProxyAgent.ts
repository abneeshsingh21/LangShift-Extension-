import type { Agent } from 'http';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { ConfigManager } from './ConfigManager';

export function getProxyAgent(targetBaseUrl = 'https://api.openai.com'): Agent | undefined {
  const proxyUrl = ConfigManager.getConfig().proxyUrl.trim();
  if (!proxyUrl) return undefined;

  try {
    const targetProtocol = new URL(targetBaseUrl).protocol;
    if (targetProtocol === 'http:') {
      return new HttpProxyAgent(proxyUrl) as Agent;
    }
    return new HttpsProxyAgent(proxyUrl) as Agent;
  } catch {
    return undefined;
  }
}

export function applyProxyEnvironment(): void {
  const proxyUrl = ConfigManager.getConfig().proxyUrl.trim();
  if (!proxyUrl) return;

  process.env.HTTPS_PROXY = process.env.HTTPS_PROXY || proxyUrl;
  process.env.HTTP_PROXY = process.env.HTTP_PROXY || proxyUrl;
}
