/** Page titles, shared by the sidebar and the header so they can't drift apart. */
export const PAGE_TITLES: Record<string, string> = {
  "/chat": "Chat",
  "/workspace": "Overview",
  "/projects": "Projects",
  "/knowledge": "Knowledge",
  "/graph": "Knowledge graph",
  "/agents": "Agents",
  "/tasks": "Tasks",
  "/intelligence": "Models",
  "/automation": "Automations",
  "/debug/memory": "Memory inspector",
  "/debug/context": "Retrieval tester",
}

/** Title for a pathname, matching the most specific known route. In development "/" shows the chat. */
export function pageTitle(pathname: string | null): string {
  if (!pathname || pathname === "/") return PAGE_TITLES["/chat"]
  const match = Object.keys(PAGE_TITLES)
    .filter((route) => pathname === route || pathname.startsWith(route + "/"))
    .sort((a, b) => b.length - a.length)[0]
  return match ? PAGE_TITLES[match] : "Torvaix"
}

/** Whether a nav link should be shown as the current page. */
export function isActiveRoute(pathname: string | null, href: string): boolean {
  if (!pathname) return false
  if (pathname === "/" && href === "/chat") return true
  return pathname === href || pathname.startsWith(href + "/")
}
