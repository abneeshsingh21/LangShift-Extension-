export interface ValidationResult {
  isValid:  boolean;
  warnings: string[];
  errors:   string[];
}

export class CodeValidator {
  static validate(code: string, language: string): ValidationResult {
    const warnings: string[] = [];
    const errors:   string[] = [];

    if (!code || !code.trim()) {
      return { isValid: false, warnings, errors: ['Converted code is empty.'] };
    }

    // Detect AI refusal messages
    const lower100 = code.toLowerCase().slice(0, 300);
    const refusalPhrases = [
      "i can't convert", "i cannot convert", "unable to convert",
      "not able to convert", "cannot be converted", "i'm sorry, but",
    ];
    if (refusalPhrases.some(p => lower100.includes(p))) {
      errors.push('AI returned an error/refusal instead of converted code.');
      return { isValid: false, warnings, errors };
    }

    // Leftover markdown fences
    if (code.includes('```')) {
      warnings.push('Response contained markdown fences — stripped during processing.');
    }

    switch (language) {
      case 'Java':       this.java(code, warnings, errors);       break;
      case 'Python':     this.python(code, warnings, errors);     break;
      case 'C++':        this.cpp(code, warnings, errors);        break;
      case 'C':          this.c(code, warnings, errors);          break;
      case 'Go':         this.go(code, warnings, errors);         break;
      case 'Rust':       this.rust(code, warnings, errors);       break;
      case 'TypeScript': this.typescript(code, warnings, errors); break;
      case 'C#':         this.csharp(code, warnings, errors);     break;
      case 'Swift':      this.swift(code, warnings, errors);      break;
      case 'Kotlin':     this.kotlin(code, warnings, errors);     break;
      case 'JavaScript': this.javascript(code, warnings, errors); break;
      case 'Ruby':       this.ruby(code, warnings, errors);       break;
      case 'PHP':        this.php(code, warnings, errors);        break;
      case 'Scala':      this.scala(code, warnings, errors);      break;
      case 'Dart':       this.dart(code, warnings, errors);       break;
      case 'Shell':      this.shell(code, warnings, errors);      break;
      case 'PowerShell': this.powershell(code, warnings, errors); break;
      case 'Haskell':    this.haskell(code, warnings, errors);    break;
      case 'Elixir':     this.elixir(code, warnings, errors);     break;
      case 'Lua':        this.lua(code, warnings, errors);        break;
      case 'Perl':       this.perl(code, warnings, errors);       break;
      case 'R':          this.r(code, warnings, errors);          break;
    }

    return { isValid: errors.length === 0, warnings, errors };
  }

  private static balancedBraces(code: string): boolean {
    // Strip string contents to avoid counting braces inside strings
    const stripped = code.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
    // Strip single-line comments
    const noComments = stripped.replace(/\/\/.*$/gm, '').replace(/#.*$/gm, '');
    const opens  = (noComments.match(/{/g) ?? []).length;
    const closes = (noComments.match(/}/g) ?? []).length;
    return opens === closes;
  }

  private static java(code: string, w: string[], e: string[]): void {
    if (!/\bclass\b|\binterface\b|\benum\b/.test(code))
      w.push('No class/interface/enum found — may be incomplete.');
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in Java output.');
  }

  private static python(code: string, w: string[], e: string[]): void {
    const hasSpaces = /^ {4}/m.test(code);
    const hasTabs   = /^\t/m.test(code);
    if (hasSpaces && hasTabs)
      e.push('Mixed tabs and spaces — will cause IndentationError in Python.');
    if (/;$/m.test(code))
      w.push('Python code ends lines with semicolons — likely non-idiomatic.');
  }

  private static cpp(code: string, w: string[], e: string[]): void {
    if (!/#include/.test(code))
      w.push('No #include statements — standard library may be missing.');
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in C++ output.');
  }

  private static c(code: string, w: string[], e: string[]): void {
    if (!/#include/.test(code))
      w.push('No #include found — headers may be missing.');
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in C output.');
  }

  private static go(code: string, w: string[], e: string[]): void {
    if (!/^package\s+\w+/m.test(code))
      e.push('Missing package declaration — required in Go.');
    if (!/\bfunc\b/.test(code))
      w.push('No func declarations found in Go output.');
  }

  private static rust(code: string, w: string[], e: string[]): void {
    if (!/\bfn\b/.test(code))
      w.push('No fn declarations found in Rust output.');
    if (/\bunsafe\b/.test(code) && !/\/\/ SAFETY/.test(code))
      w.push('unsafe blocks present without SAFETY comments.');
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in Rust output.');
  }

  private static typescript(code: string, w: string[], _e: string[]): void {
    if (!/:\s*(string|number|boolean|void|any|unknown|never|Array|Promise|Record|Map|Set|null|undefined|object)\b/.test(code) && !/:\s*[A-Z]\w+/.test(code))
      w.push('No type annotations found — may be plain JS rather than TypeScript.');
  }

  private static csharp(code: string, w: string[], e: string[]): void {
    if (!/\bnamespace\b/.test(code))
      w.push('No namespace declaration found in C# output.');
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in C# output.');
  }

  private static swift(code: string, w: string[], _e: string[]): void {
    if (!/\bimport\s+Foundation\b|\bimport\s+Swift\b/.test(code))
      w.push('No import found — Swift may need Foundation or stdlib imports.');
  }

  private static kotlin(code: string, _w: string[], e: string[]): void {
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in Kotlin output.');
  }

  private static javascript(code: string, w: string[], _e: string[]): void {
    if (!/\bfunction\b|=>|\bclass\b|\bconst\b|\blet\b/.test(code))
      w.push('No function/class/variable declarations found in JavaScript output.');
  }

  private static ruby(code: string, w: string[], _e: string[]): void {
    if (!/\bdef\b|\bclass\b|\bmodule\b/.test(code))
      w.push('No def/class/module found in Ruby output.');
    if (/;$/m.test(code))
      w.push('Ruby code contains trailing semicolons — non-idiomatic.');
  }

  private static php(code: string, w: string[], e: string[]): void {
    if (!/^<\?php/m.test(code) && !/^<\?/m.test(code))
      w.push('No <?php opening tag found.');
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in PHP output.');
  }

  private static scala(code: string, w: string[], e: string[]): void {
    if (!/\bdef\b|\bval\b|\bvar\b|\bobject\b|\bclass\b/.test(code))
      w.push('No Scala declarations found.');
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in Scala output.');
  }

  private static dart(code: string, w: string[], e: string[]): void {
    if (!/\bvoid\b|\bclass\b|\bfinal\b|\bvar\b/.test(code))
      w.push('No Dart declarations found.');
    if (!this.balancedBraces(code))
      e.push('Unbalanced braces { } in Dart output.');
  }

  private static shell(code: string, w: string[], _e: string[]): void {
    if (!/^#!.*(?:bash|sh|zsh)/m.test(code))
      w.push('No shebang line found — consider adding #!/bin/bash.');
  }

  private static powershell(code: string, w: string[], _e: string[]): void {
    if (!/\bfunction\b|\bparam\b|\$\w+/.test(code))
      w.push('No PowerShell constructs found in output.');
  }

  private static haskell(code: string, w: string[], _e: string[]): void {
    if (!/\bmodule\b|\bimport\b|\bwhere\b|::\s/.test(code))
      w.push('No Haskell module/import/type signature found.');
  }

  private static elixir(code: string, w: string[], _e: string[]): void {
    if (!/\bdefmodule\b|\bdef\b|\bdefp\b/.test(code))
      w.push('No Elixir defmodule/def found.');
  }

  private static lua(code: string, w: string[], _e: string[]): void {
    if (!/\bfunction\b|\blocal\b/.test(code))
      w.push('No Lua function/local declarations found.');
  }

  private static perl(code: string, w: string[], _e: string[]): void {
    if (!/\bsub\b|\buse\b|\bmy\b/.test(code))
      w.push('No Perl sub/use/my found.');
  }

  private static r(code: string, w: string[], _e: string[]): void {
    if (!/\bfunction\b|\blibrary\(|<-/.test(code))
      w.push('No R function/library/assignment found.');
  }
}
