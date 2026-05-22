import { describe, expect, it } from "bun:test";
import { levenshtein, similarity } from "../fuzzy";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("counts single edits", () => {
    expect(levenshtein("kitten", "sitten")).toBe(1);
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("handles empty strings", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "")).toBe(0);
  });
});

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for completely different", () => {
    expect(similarity("abc", "xyz")).toBe(0);
  });

  it("scores close matches near 1", () => {
    expect(similarity("Lockheed Martin", "Lockheed Martin Corp")).toBeGreaterThan(0.7);
  });
});
