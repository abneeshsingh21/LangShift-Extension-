import { AIProvider } from '../utils/ConfigManager';

export interface RouteRecommendation {
  provider: AIProvider;
  model: string;
  reason: string;
}

/** 
 * Model routing table based on community benchmarks and known model strengths.
 * Falls back to user's configured provider if no specific route exists.
 */
export class ModelRouter {
  // Curated routing table: "FromLang→ToLang" → best provider+model
  private static readonly ROUTES: Record<string, RouteRecommendation> = {
    // Claude excels at Python and Java
    'Python→Java':         { provider: 'anthropic', model: 'claude-sonnet-4-20250514', reason: 'Claude excels at Python→Java type mapping' },
    'Python→TypeScript':   { provider: 'anthropic', model: 'claude-sonnet-4-20250514', reason: 'Claude handles Python→TS type inference well' },
    'Python→C++':          { provider: 'anthropic', model: 'claude-sonnet-4-20250514', reason: 'Claude handles memory management patterns' },
    
    // Gemini is strong with Go and Dart (Google languages)
    'Python→Go':           { provider: 'gemini', model: 'gemini-2.0-flash', reason: 'Gemini excels at Go idioms' },
    'Python→Dart':         { provider: 'gemini', model: 'gemini-2.0-flash', reason: 'Gemini has strong Dart/Flutter knowledge' },
    'JavaScript→Dart':     { provider: 'gemini', model: 'gemini-2.0-flash', reason: 'Gemini knows Dart best' },
    'Java→Go':             { provider: 'gemini', model: 'gemini-2.0-flash', reason: 'Gemini handles Go concurrency patterns well' },
    'Java→Kotlin':         { provider: 'gemini', model: 'gemini-2.0-flash', reason: 'Gemini knows Kotlin interop' },
    
    // GPT-4o is strong with JS/TS ecosystem
    'JavaScript→TypeScript': { provider: 'openai', model: 'gpt-4o', reason: 'GPT-4o excels at JS→TS type inference' },
    'Python→JavaScript':     { provider: 'openai', model: 'gpt-4o', reason: 'GPT-4o handles JS ecosystem well' },
    'TypeScript→Python':     { provider: 'openai', model: 'gpt-4o', reason: 'GPT-4o handles TS→Python async patterns well' },
    'Java→TypeScript':       { provider: 'openai', model: 'gpt-4o', reason: 'GPT-4o maps Java types to TS well' },

    // Rust conversions — Claude handles ownership/borrowing best
    'Python→Rust':         { provider: 'anthropic', model: 'claude-sonnet-4-20250514', reason: 'Claude handles Rust ownership/borrowing' },
    'C++→Rust':            { provider: 'anthropic', model: 'claude-sonnet-4-20250514', reason: 'Claude maps C++ RAII to Rust idioms' },
    'Java→Rust':           { provider: 'anthropic', model: 'claude-sonnet-4-20250514', reason: 'Claude handles Rust type system well' },
  };

  /**
   * Get the recommended provider+model for a language pair.
   * Returns null if no specific route exists (use user's configured provider).
   */
  static getRoute(fromLang: string, toLang: string): RouteRecommendation | null {
    const key = `${fromLang}→${toLang}`;
    return this.ROUTES[key] ?? null;
  }

  /**
   * Get all available routes for display.
   */
  static getAllRoutes(): Array<{ pair: string; recommendation: RouteRecommendation }> {
    return Object.entries(this.ROUTES).map(([pair, recommendation]) => ({ pair, recommendation }));
  }

  /**
   * Check if we have a specific route for this pair.
   */
  static hasRoute(fromLang: string, toLang: string): boolean {
    return `${fromLang}→${toLang}` in this.ROUTES;
  }
}
