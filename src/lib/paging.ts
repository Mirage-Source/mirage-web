export interface Page<T> {
  items: T[];
  next: string | null;
}

export async function collectPages<T>(
  fetchPage: (after?: string) => Promise<Page<T>>,
  maxPages: number,
): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await fetchPage(after);
    for (const item of page.items) out.push(item);
    if (!page.next || page.items.length === 0) break;
    after = page.next;
  }
  return out;
}
