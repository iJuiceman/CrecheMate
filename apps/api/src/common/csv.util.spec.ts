import { escapeCsvCell } from "./csv.util";

describe("escapeCsvCell — CSV formula injection (CWE-1236)", () => {
  it("neutralises formula-leading cells with an apostrophe", () => {
    expect(escapeCsvCell('=HYPERLINK("http://evil","x")')).toBe(
      `"'=HYPERLINK(""http://evil"",""x"")"`,
    );
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
    expect(escapeCsvCell("+1234")).toBe("'+1234");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    // tab triggers the formula guard but not RFC-4180 quoting (only " , \n \r do).
    expect(escapeCsvCell("\tTAB")).toBe("'\tTAB");
  });

  it("guards a leading-dash formula but preserves negative numbers", () => {
    expect(escapeCsvCell("-cmd|' /C calc'!A0")).toBe("'-cmd|' /C calc'!A0");
    // Refund amounts must stay numeric for Xero's importer.
    expect(escapeCsvCell("-30.00")).toBe("-30.00");
    expect(escapeCsvCell("-5")).toBe("-5");
    expect(escapeCsvCell(-30)).toBe("-30");
  });

  it("keeps ordinary values and applies RFC-4180 quoting", () => {
    expect(escapeCsvCell("Boss Baby")).toBe("Boss Baby");
    expect(escapeCsvCell("Smith, Jane")).toBe('"Smith, Jane"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell(1000)).toBe("1000");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });
});
