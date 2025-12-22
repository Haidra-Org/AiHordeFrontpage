/**
 * Utility functions for parsing user identifiers.
 *
 * AI Horde uses the format "alias#id" for usernames, where:
 * - "alias" is the user's display name
 * - "id" is the numeric user ID
 *
 * Examples: "MyUser#12345", "Anonymous#0"
 */

/**
 * Extract the numeric user ID from an "alias#id" formatted string.
 * @param usernameOrOwner - A string in "alias#id" format (e.g., "MyUser#12345")
 * @returns The numeric user ID, or null if parsing fails
 */
export function extractUserId(
  usernameOrOwner: string | undefined | null,
): number | null {
  if (!usernameOrOwner) {
    return null;
  }

  const match = usernameOrOwner.match(/#(\d+)$/);
  if (match && match[1]) {
    const id = parseInt(match[1], 10);
    return isNaN(id) ? null : id;
  }

  // If it's just a number, treat it as a user ID
  const numericId = parseInt(usernameOrOwner, 10);
  if (!isNaN(numericId) && usernameOrOwner.trim() === numericId.toString()) {
    return numericId;
  }

  return null;
}

/**
 * Extract the display alias from an "alias#id" formatted string.
 * @param username - A string in "alias#id" format (e.g., "MyUser#12345")
 * @returns The alias portion, or the original string if no "#id" suffix found
 */
export function extractUserAlias(username: string | undefined | null): string {
  if (!username) {
    return '';
  }

  const match = username.match(/^(.+?)#\d+$/);
  return match ? match[1] : username;
}

/**
 * Check if a string looks like a user ID input.
 * Returns true if it's a pure numeric string or an "alias#id" format.
 * @param input - The user input to check
 */
export function isValidUserIdInput(input: string | undefined | null): boolean {
  if (!input) {
    return false;
  }

  const trimmed = input.trim();

  // Pure numeric
  if (/^\d+$/.test(trimmed)) {
    return true;
  }

  // alias#id format
  if (/#\d+$/.test(trimmed)) {
    return true;
  }

  return false;
}
