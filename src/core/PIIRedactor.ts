export interface RedactionResult {
  redactedCode: string;
  redactions: Map<string, string>;
  redactionCount: number;
}

export class PIIRedactor {
  private static readonly PATTERNS: Array<[RegExp, string]> = [
    // Email addresses
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'EMAIL'],
    // IPv4 addresses (but not version numbers like 1.2.3)
    [/\b(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g, 'IP'],
    // US phone numbers
    [/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, 'PHONE'],
    // US SSN
    [/\b\d{3}-\d{2}-\d{4}\b/g, 'SSN'],
    // Credit card numbers (basic)
    [/\b(?:\d{4}[-.\s]?){3}\d{4}\b/g, 'CREDIT_CARD'],
    // AWS access keys
    [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, 'AWS_KEY'],
    // Generic bearer tokens
    [/\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi, 'BEARER_TOKEN'],
  ];

  static redact(code: string): RedactionResult {
    const redactions = new Map<string, string>();
    let counter = 0;
    let redactedCode = code;

    for (const [pattern, label] of this.PATTERNS) {
      // Reset global regex
      pattern.lastIndex = 0;
      redactedCode = redactedCode.replace(pattern, (match) => {
        // Don't redact localhost or common test IPs
        if (label === 'IP' && (match === '127.0.0.1' || match === '0.0.0.0' || match.startsWith('192.168.'))) {
          return match;
        }
        const placeholder = `__REDACTED_${label}_${counter++}__`;
        redactions.set(placeholder, match);
        return placeholder;
      });
    }

    return { redactedCode, redactions, redactionCount: counter };
  }

  static restore(code: string, redactions: Map<string, string>): string {
    let restored = code;
    for (const [placeholder, original] of redactions) {
      // Use split+join for global replace without regex special char issues
      restored = restored.split(placeholder).join(original);
    }
    return restored;
  }
}
