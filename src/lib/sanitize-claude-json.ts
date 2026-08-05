/** Sanitise common Claude output issues that break JSON.parse(). */
export function sanitiseClaudeJson(text: string): string {
  return text
    // curly/smart quotes → straight
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    // em dash / en dash → hyphen
    .replace(/[—–]/g, "-")
    // remove control characters (except tab/newline/CR which are valid in JSON)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}
