/** `/en` プレフィックスの付け外し（言語切り替えリンク用） */

export function stripEnPrefix(pathname: string): string {
  if (pathname === "/en" || pathname === "/en/") return "/";
  if (pathname.startsWith("/en/")) {
    const rest = pathname.slice(4);
    return rest ? `/${rest}` : "/";
  }
  return pathname;
}

export function addEnPrefix(pathname: string): string {
  const p = pathname === "" ? "/" : pathname;
  if (p === "/") return "/en";
  return `/en${p}`;
}
