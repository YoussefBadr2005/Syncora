export type NavItem = { label: string; href: string; managerOnly?: boolean; icon: string };

export const NAV: NavItem[] = [
  { label: "Board",    href: "/board",    icon: "board" },
  { label: "Projects", href: "/projects", icon: "projects" },
  { label: "Overview", href: "/overview", icon: "overview", managerOnly: true },
  { label: "Manage",   href: "/manage",   icon: "manage",   managerOnly: true },
];
