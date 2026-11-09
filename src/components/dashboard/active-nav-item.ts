// Which item of a sidebar is the current page: the one whose address is the longest start of the path.
// "Longest" matters when one item sits under another's address: the employer's Dashboard is /acme and
// Company profile is /acme/profile, and on /acme/profile only the second is the page you are on. A
// start is a whole path segment, so /acme-labs does not belong to /acme. Null when nothing matches.
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const matches = pathname === href || pathname.startsWith(`${href}/`);
    if (matches && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
