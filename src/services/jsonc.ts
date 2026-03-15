/**
 * Strips comments from JSONC content while respecting string boundaries.
 * Handles // and /* comments, URLs in strings, and escaped quotes.
 */
export function stripJsoncComments(content: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  let inSingleLineComment = false;
  let inMultiLineComment = false;

  while (i < content.length) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (!inSingleLineComment && !inMultiLineComment) {
      if (char === '"') {
        // Count consecutive backslashes before this quote
        let backslashCount = 0;
        let j = i - 1;
        while (j >= 0 && content[j] === "\\") {
          backslashCount++;
          j--;
        }
        // Quote is escaped only if preceded by ODD number of backslashes
        // e.g., \" = escaped, \\" = not escaped (escaped backslash + quote)
        if (backslashCount % 2 === 0) {
          inString = !inString;
        }
        result += char;
        i++;
        continue;
      }
    }

    if (inString) {
      result += char;
      i++;
      continue;
    }

    if (!inSingleLineComment && !inMultiLineComment) {
      if (char === "/" && nextChar === "/") {
        inSingleLineComment = true;
        i += 2;
        continue;
      }

      if (char === "/" && nextChar === "*") {
        inMultiLineComment = true;
        i += 2;
        continue;
      }
    }

    if (inSingleLineComment) {
      if (char === "\n") {
        inSingleLineComment = false;
        result += char;
      }
      i++;
      continue;
    }

    if (inMultiLineComment) {
      if (char === "*" && nextChar === "/") {
        inMultiLineComment = false;
        i += 2;
        continue;
      }
      if (char === "\n") {
        result += char;
      }
      i++;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}

/**
 * Removes trailing commas from JSON/JSONC content while respecting strings.
 */
export function stripJsonTrailingCommas(content: string): string {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < content.length) {
    const char = content[i];

    if (char === '"') {
      let backslashCount = 0;
      let j = i - 1;
      while (j >= 0 && content[j] === "\\") {
        backslashCount++;
        j--;
      }
      if (backslashCount % 2 === 0) {
        inString = !inString;
      }
      result += char;
      i++;
      continue;
    }

    if (!inString && char === ",") {
      let j = i + 1;
      while (j < content.length) {
        const lookahead = content[j];
        if (lookahead === undefined || !/\s/.test(lookahead)) {
          break;
        }
        j++;
      }

      const trailingChar = content[j];
      if (trailingChar === "}" || trailingChar === "]") {
        i++;
        continue;
      }
    }

    result += char;
    i++;
  }

  return result;
}

export function parseJsonc<T>(content: string): T {
  return JSON.parse(stripJsonTrailingCommas(stripJsoncComments(content))) as T;
}
