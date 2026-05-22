import { describe, expect, it } from "bun:test";
import { canonicalName, namesMatch } from "../names";

describe("canonicalName", () => {
  it("lowercases", () => {
    expect(canonicalName("LOCKHEED MARTIN")).toBe("lockheed martin");
  });

  it("strips corporate suffixes", () => {
    expect(canonicalName("Lockheed Martin Corp")).toBe("lockheed martin");
    expect(canonicalName("Lockheed Martin Corporation")).toBe("lockheed martin");
    expect(canonicalName("Lockheed Martin Inc.")).toBe("lockheed martin");
    expect(canonicalName("Lockheed Martin LLC")).toBe("lockheed martin");
  });

  it("strips stopwords", () => {
    expect(canonicalName("The Boeing Company")).toBe("boeing");
  });

  it("normalizes whitespace", () => {
    expect(canonicalName("  Lockheed   Martin  ")).toBe("lockheed martin");
  });

  it("handles punctuation", () => {
    expect(canonicalName("Lockheed Martin, Inc.")).toBe("lockheed martin");
  });
});

describe("namesMatch", () => {
  it("matches obvious variants", () => {
    expect(namesMatch("Lockheed Martin Corp", "Lockheed Martin Corporation")).toBe(true);
    expect(namesMatch("The Boeing Co.", "Boeing Company")).toBe(true);
  });

  it("does not match different entities", () => {
    expect(namesMatch("Lockheed Martin", "Boeing")).toBe(false);
  });
});
