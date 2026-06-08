import * as path from 'path';

export interface LanguageInfo {
  name:       string;
  extensions: string[];   // primary first
  isTyped:    boolean;
  hasClasses: boolean;
  paradigm:   string;
}

const LANGUAGES: LanguageInfo[] = [
  { name: 'Python',     extensions: ['py','pyw'],          isTyped: false, hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'JavaScript', extensions: ['js','mjs','cjs'],    isTyped: false, hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'TypeScript', extensions: ['ts','tsx'],          isTyped: true,  hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'JSX',        extensions: ['jsx'],               isTyped: false, hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'Java',       extensions: ['java'],              isTyped: true,  hasClasses: true,  paradigm: 'object-oriented'   },
  { name: 'C++',        extensions: ['cpp','cxx','cc'],    isTyped: true,  hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'C',          extensions: ['c','h'],             isTyped: true,  hasClasses: false, paradigm: 'procedural'        },
  { name: 'C#',         extensions: ['cs'],                isTyped: true,  hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'Go',         extensions: ['go'],                isTyped: true,  hasClasses: false, paradigm: 'multi-paradigm'    },
  { name: 'Rust',       extensions: ['rs'],                isTyped: true,  hasClasses: false, paradigm: 'multi-paradigm'    },
  { name: 'Ruby',       extensions: ['rb'],                isTyped: false, hasClasses: true,  paradigm: 'object-oriented'   },
  { name: 'PHP',        extensions: ['php'],               isTyped: false, hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'Swift',      extensions: ['swift'],             isTyped: true,  hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'Kotlin',     extensions: ['kt','kts'],          isTyped: true,  hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'Scala',      extensions: ['scala'],             isTyped: true,  hasClasses: true,  paradigm: 'multi-paradigm'    },
  { name: 'Dart',       extensions: ['dart'],              isTyped: true,  hasClasses: true,  paradigm: 'object-oriented'   },
  { name: 'Lua',        extensions: ['lua'],               isTyped: false, hasClasses: false, paradigm: 'multi-paradigm'    },
  { name: 'Perl',       extensions: ['pl','pm'],           isTyped: false, hasClasses: false, paradigm: 'multi-paradigm'    },
  { name: 'Haskell',    extensions: ['hs'],                isTyped: true,  hasClasses: false, paradigm: 'functional'        },
  { name: 'Elixir',     extensions: ['ex','exs'],          isTyped: false, hasClasses: false, paradigm: 'functional'        },
  { name: 'R',          extensions: ['r'],                 isTyped: false, hasClasses: false, paradigm: 'functional'        },
  { name: 'MATLAB',     extensions: ['m'],                 isTyped: false, hasClasses: false, paradigm: 'procedural'        },
  { name: 'Shell',      extensions: ['sh','bash','zsh'],   isTyped: false, hasClasses: false, paradigm: 'scripting'         },
  { name: 'PowerShell', extensions: ['ps1'],               isTyped: false, hasClasses: false, paradigm: 'scripting'         },
];

// Build reverse map: lowercase extension → LanguageInfo
const EXT_MAP = new Map<string, LanguageInfo>();
for (const lang of LANGUAGES) {
  for (const ext of lang.extensions) {
    EXT_MAP.set(ext.toLowerCase(), lang);
  }
}

// Build name map: lowercase name → LanguageInfo
const NAME_MAP = new Map<string, LanguageInfo>();
for (const lang of LANGUAGES) {
  NAME_MAP.set(lang.name.toLowerCase(), lang);
}

export class LanguageDetector {
  /** Get language name from a file extension (without leading dot). Returns null if unknown. */
  static fromExtension(ext: string): string | null {
    return EXT_MAP.get(ext.toLowerCase())?.name ?? null;
  }

  /** Get language name directly from a full file path */
  static fromFilePath(filePath: string): string | null {
    const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
    return ext ? this.fromExtension(ext) : null;
  }

  /** Get the primary file extension (with dot) for a language name */
  static getExtension(lang: string): string | null {
    const info = NAME_MAP.get(lang.toLowerCase());
    return info ? `.${info.extensions[0]}` : null;
  }

  /** Get full LanguageInfo for a name */
  static getInfo(lang: string): LanguageInfo | null {
    return NAME_MAP.get(lang.toLowerCase()) ?? null;
  }

  /** All supported language names, sorted alphabetically */
  static getAllLanguages(): string[] {
    return LANGUAGES.map(l => l.name).sort((a, b) => a.localeCompare(b));
  }

  /** True if the extension is a known programming language */
  static isSupported(ext: string): boolean {
    return EXT_MAP.has(ext.toLowerCase());
  }

  /** Human-readable compatibility note for a conversion pair */
  static compatibilityNote(fromLang: string, toLang: string): string | null {
    const from = NAME_MAP.get(fromLang.toLowerCase());
    const to   = NAME_MAP.get(toLang.toLowerCase());
    if (!from || !to) return null;
    const notes: string[] = [];
    if (from.hasClasses && !to.hasClasses)  notes.push(`${toLang} has no classes — OOP patterns will be adapted`);
    if (!from.isTyped   && to.isTyped)      notes.push(`Types will be inferred and added for ${toLang}`);
    if (from.isTyped    && !to.isTyped)     notes.push(`Type annotations will be dropped for dynamic ${toLang}`);
    return notes.length > 0 ? notes.join('. ') : null;
  }
}
