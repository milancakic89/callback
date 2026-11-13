// Supabase answers at most 1000 rows to a single request (PostgREST's max-rows), however many
// match, and says nothing when it cuts the list short. Anything that must have every row reads it a
// page at a time with this.
//
// `fetchPage(from, to)` reads the rows from index `from` to `to`, both inclusive (what `.range()`
// takes), and throws when the database fails, so a caller never ends up with the pages read so far
// mistaken for all of them. Reading stops at the first page with fewer rows than `pageSize`: a list
// that is an exact multiple costs one more, empty, request. The rows must come in a stable order
// (an `order` on the query, or the order of the function), or a row can fall between two pages.
export async function fetchAllPages<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<Row[]>,
  pageSize: number,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
