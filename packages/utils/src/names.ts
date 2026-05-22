/**
 * Entity name canonicalization.
 *
 * Federal data has the same company spelled 50 ways:
 *   "LOCKHEED MARTIN CORP", "Lockheed Martin Corporation",
 *   "LOCKHEED MARTIN CORP.", "Lockheed Martin Corp,",
 * canonicalName() normalizes them all to "lockheed martin" so we can match.
 */

const CORPORATE_SUFFIXES = new Set([
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "llc",
  "lp",
  "llp",
  "co",
  "company",
  "ltd",
  "limited",
  "plc",
  "gmbh",
  "ag",
  "sa",
  "nv",
  "holdings",
  "group",
  "intl",
  "international",
]);

const STOPWORDS = new Set(["the", "a", "an", "of", "&", "and"]);

export function canonicalName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD") // accents → ASCII
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,;:!?()[\]{}'"`]/g, " ") // strip punctuation
    .replace(/\s+/g, " ") // collapse whitespace
    .trim()
    .split(" ")
    .filter((word) => word && !STOPWORDS.has(word) && !CORPORATE_SUFFIXES.has(word))
    .join(" ");
}

/** Check if two names likely refer to the same entity. */
export function namesMatch(a: string, b: string): boolean {
  return canonicalName(a) === canonicalName(b);
}
