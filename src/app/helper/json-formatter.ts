/**
 * JSON formatting utilities for syntax highlighting and display.
 */

/**
 * Escapes HTML special characters to prevent XSS vulnerabilities.
 *
 * @param value - The string to escape
 * @returns The escaped string safe for HTML insertion
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Converts a value to a formatted JSON string.
 *
 * @param value - The value to stringify
 * @returns A formatted JSON string, or empty string if stringification fails
 */
export function stringifyAsJson(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    console.error('Failed to stringify JSON payload', error);
    return '';
  }
}

/**
 * Adds syntax highlighting to JSON strings by wrapping tokens in HTML spans.
 * The resulting HTML should be used with [innerHTML] and requires CSS classes:
 * - .json-key (for object keys)
 * - .json-string (for string values)
 * - .json-number (for numeric values)
 * - .json-boolean (for true/false)
 * - .json-null (for null values)
 *
 * @param json - The JSON string to highlight
 * @returns HTML string with syntax highlighting spans
 */
export function highlightJson(json: string): string {
  if (!json) {
    return '';
  }

  return json.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"\s*:|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      if (match.startsWith('"') && match.endsWith(':')) {
        const key = match.slice(0, -1);
        return `<span class="json-key">${escapeHtml(key)}</span>:`;
      }

      if (match.startsWith('"')) {
        return `<span class="json-string">${escapeHtml(match)}</span>`;
      }

      if (match === 'true' || match === 'false') {
        return `<span class="json-boolean">${match}</span>`;
      }

      if (match === 'null') {
        return `<span class="json-null">${match}</span>`;
      }

      return `<span class="json-number">${match}</span>`;
    },
  );
}
