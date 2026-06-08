/**
 * Few-shot examples for popular language pairs.
 * These are injected into the AI prompt before the user's code
 * to dramatically improve conversion accuracy.
 */

export interface FewShotExample {
  sourceCode: string;
  targetCode: string;
  description: string;
}

const EXAMPLES: Record<string, FewShotExample[]> = {
  'Python→Java': [
    {
      description: 'List comprehension → Java streams',
      sourceCode: `# Filter and transform a list\nresults = [x * 2 for x in numbers if x > 0]`,
      targetCode: `// Filter and transform a list\nList<Integer> results = numbers.stream()\n    .filter(x -> x > 0)\n    .map(x -> x * 2)\n    .collect(Collectors.toList());`,
    },
    {
      description: 'Context manager → try-with-resources',
      sourceCode: `with open('file.txt', 'r') as f:\n    content = f.read()`,
      targetCode: `try (BufferedReader f = new BufferedReader(new FileReader("file.txt"))) {\n    String content = f.lines().collect(Collectors.joining("\\n"));\n}`,
    },
  ],
  'Python→TypeScript': [
    {
      description: 'Dict type hints → TypeScript interfaces',
      sourceCode: `from typing import TypedDict\n\nclass User(TypedDict):\n    name: str\n    age: int\n    email: str\n\ndef greet(user: User) -> str:\n    return f"Hello, {user['name']}"`,
      targetCode: `interface User {\n  name: string;\n  age: number;\n  email: string;\n}\n\nfunction greet(user: User): string {\n  return \`Hello, \${user.name}\`;\n}`,
    },
  ],
  'JavaScript→TypeScript': [
    {
      description: 'Dynamic JS → typed TS',
      sourceCode: `function processItems(items) {\n  return items.filter(item => item.active).map(item => ({\n    id: item.id,\n    label: item.name.toUpperCase()\n  }));\n}`,
      targetCode: `interface Item {\n  id: number;\n  name: string;\n  active: boolean;\n}\n\ninterface ProcessedItem {\n  id: number;\n  label: string;\n}\n\nfunction processItems(items: Item[]): ProcessedItem[] {\n  return items.filter(item => item.active).map(item => ({\n    id: item.id,\n    label: item.name.toUpperCase()\n  }));\n}`,
    },
  ],
  'Python→Go': [
    {
      description: 'Exception handling → error returns',
      sourceCode: `def divide(a: float, b: float) -> float:\n    if b == 0:\n        raise ValueError("division by zero")\n    return a / b`,
      targetCode: `func divide(a, b float64) (float64, error) {\n\tif b == 0 {\n\t\treturn 0, fmt.Errorf("division by zero")\n\t}\n\treturn a / b, nil\n}`,
    },
  ],
  'Python→Rust': [
    {
      description: 'Option/None → Option<T>',
      sourceCode: `def find_user(users: list, name: str) -> dict | None:\n    for user in users:\n        if user["name"] == name:\n            return user\n    return None`,
      targetCode: `fn find_user(users: &[User], name: &str) -> Option<&User> {\n    users.iter().find(|u| u.name == name)\n}`,
    },
  ],
  'Java→TypeScript': [
    {
      description: 'Java generics → TypeScript generics',
      sourceCode: `public class Repository<T> {\n    private final List<T> items = new ArrayList<>();\n\n    public void add(T item) {\n        items.add(item);\n    }\n\n    public Optional<T> findFirst(Predicate<T> predicate) {\n        return items.stream().filter(predicate).findFirst();\n    }\n}`,
      targetCode: `class Repository<T> {\n  private items: T[] = [];\n\n  add(item: T): void {\n    this.items.push(item);\n  }\n\n  findFirst(predicate: (item: T) => boolean): T | undefined {\n    return this.items.find(predicate);\n  }\n}`,
    },
  ],
};

export class FewShotExamples {
  /**
   * Get few-shot examples for a language pair.
   * Returns an empty array if no examples exist.
   */
  static get(fromLang: string, toLang: string): FewShotExample[] {
    return EXAMPLES[`${fromLang}→${toLang}`] ?? [];
  }

  /**
   * Format examples into a prompt-ready string.
   */
  static formatForPrompt(fromLang: string, toLang: string): string {
    const examples = this.get(fromLang, toLang);
    if (examples.length === 0) return '';

    const lines = [`// EXAMPLES of correct ${fromLang} → ${toLang} conversions:`];
    for (const ex of examples) {
      lines.push(`// Example: ${ex.description}`);
      lines.push(`// Input (${fromLang}):`);
      lines.push(ex.sourceCode.split('\n').map(l => `// ${l}`).join('\n'));
      lines.push(`// Output (${toLang}):`);
      lines.push(ex.targetCode.split('\n').map(l => `// ${l}`).join('\n'));
      lines.push('');
    }
    lines.push(`// Now convert the following ${fromLang} code using the same patterns:`);
    lines.push('');
    return lines.join('\n');
  }

  /**
   * Check if examples exist for a pair.
   */
  static has(fromLang: string, toLang: string): boolean {
    return (`${fromLang}→${toLang}`) in EXAMPLES;
  }

  /**
   * List all available language pairs with examples.
   */
  static availablePairs(): string[] {
    return Object.keys(EXAMPLES);
  }
}
