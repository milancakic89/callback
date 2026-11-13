import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "./paginate";

// A table of `rowCount` rows, read the way `.range(from, to)` reads it.
function tableOf(rowCount: number) {
  const allRows = Array.from({ length: rowCount }, (_, index) => index);
  return vi.fn(async (from: number, to: number) => allRows.slice(from, to + 1));
}

describe("fetchAllPages", () => {
  it("reads one page and stops when the table is empty", async () => {
    const fetchPage = tableOf(0);

    expect(await fetchAllPages(fetchPage, 1000)).toEqual([]);
    expect(fetchPage).toHaveBeenCalledExactlyOnceWith(0, 999);
  });

  it("stops after a page with fewer rows than a full one", async () => {
    const fetchPage = tableOf(999);

    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(999);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("asks for one more page when the last one is exactly full, and gets nothing from it", async () => {
    const fetchPage = tableOf(1000);

    expect(await fetchAllPages(fetchPage, 1000)).toHaveLength(1000);
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("reads 2500 rows as three pages, in order and with none missing or repeated", async () => {
    const fetchPage = tableOf(2500);

    const rows = await fetchAllPages(fetchPage, 1000);

    expect(rows).toEqual(Array.from({ length: 2500 }, (_, index) => index));
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("throws the error of a page after the first, rather than answering with the pages before it", async () => {
    const fetchPage = vi
      .fn<(from: number, to: number) => Promise<number[]>>()
      .mockResolvedValueOnce(Array.from({ length: 1000 }, (_, index) => index))
      .mockRejectedValueOnce(new Error("page 2: boom"));

    await expect(fetchAllPages(fetchPage, 1000)).rejects.toThrow("page 2: boom");
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("works with any page size", async () => {
    const fetchPage = tableOf(5);

    expect(await fetchAllPages(fetchPage, 2)).toEqual([0, 1, 2, 3, 4]);
    expect(fetchPage.mock.calls).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });
});
