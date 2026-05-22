import { describe, it, expect } from "bun:test";
import { formatMoney, parseMoney } from "../money";

describe("formatMoney", () => {
  it("formats compact by default", () => {
    expect(formatMoney(1_234)).toBe("$1.2K");
    expect(formatMoney(1_234_567)).toBe("$1.23M");
    expect(formatMoney(1_234_567_890)).toBe("$1.23B");
    expect(formatMoney(1_234_567_890_123)).toBe("$1.23T");
  });

  it("handles zero and missing", () => {
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(Number.NaN)).toBe("—");
  });

  it("handles negatives", () => {
    expect(formatMoney(-1_500_000)).toBe("-$1.50M");
  });
});

describe("parseMoney", () => {
  it("parses dollar strings", () => {
    expect(parseMoney("$1,234.56")).toBe(1234.56);
    expect(parseMoney("$1,000,000")).toBe(1_000_000);
  });

  it("passes through numbers", () => {
    expect(parseMoney(42)).toBe(42);
  });

  it("returns 0 for invalid", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney(null)).toBe(0);
    expect(parseMoney("not a number")).toBe(0);
  });
});
