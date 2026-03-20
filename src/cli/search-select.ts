import search from "@inquirer/search";
import Fuse from "fuse.js";

interface SearchSelectChoice<T> {
  value: T;
  name: string;
  description?: string;
}

interface SearchSelectOptions<T> {
  message: string;
  choices: SearchSelectChoice<T>[];
  theme?: Record<string, unknown>;
}

/**
 * Fuzzy search select prompt. Type to filter, arrow keys to navigate.
 * Uses fuse.js for fuzzy matching over the choice name and description.
 */
export async function searchSelect<T>(
  options: SearchSelectOptions<T>,
): Promise<T> {
  const { message, choices, theme } = options;

  const fuse = new Fuse(choices, {
    keys: [
      { name: "name", weight: 2 },
      { name: "description", weight: 1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
  });

  const result = await search({
    message,
    source: async (input: string | undefined) => {
      if (!input) return choices;
      const results = fuse.search(input);
      return results.map((r) => r.item);
    },
    theme: theme as Parameters<typeof search>[0]["theme"],
  });

  return result as T;
}
