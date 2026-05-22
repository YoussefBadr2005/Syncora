# Minimal Board-Centric UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Syncora frontend into a board-centric workspace (dark left sidebar, ~5 routes, slide-over task panels), add a project filter + manager "all vs. mine" toggle, and fix the image-preview-after-reload bug — without backend changes and without disturbing the live demo.

**Architecture:** All work is in `frontend/my-app` (Next.js 16 App Router, React 19, Tailwind v4, Monolith Noir dark theme). New routes/components are added alongside the old ones so the app stays runnable; the old routes are deleted only in the final task. REST contracts are unchanged; server-side role/team isolation is untouched. State stays client-side via `useAuth` + axios (`@/lib/api`).

**Tech stack:** Next.js 16, React 19, TypeScript, Tailwind CSS v4, axios, AWS Cognito (client SDK already wired).

**Conventions for this plan:**
- **No git commits/pushes by the implementer.** Each task ends with a *verify + handoff* checkpoint listing the changed files (grouped by area) so they can be routed to the owning teammate.
- **Verification per task:** `cd frontend/my-app && npm run build` must pass (Next type-checks + compiles), `npm run lint` clean, then the listed manual browser checks.
- Reuse the existing Monolith Noir tokens (`bg-surface-container`, `text-on-surface`, `border-outline-variant`, etc.). No new color system.
- Keep all rubric features working at every step (board+drag, comments, activity log, CRUD, role isolation, attachments, toasts, loading/empty states).

**Build environment note:** Next 16 needs Node ≥ 20.9. Use Node 20+ locally (`node -v`). If `next build` OOMs, `NODE_OPTIONS=--max-old-space-size=2048 npm run build`.

---

## File structure (created / modified)

**New shared kit — `frontend/my-app/src/components/ui/`:**
- `SlideOver.tsx` — right-hand panel shell (backdrop, Esc/close, sizing).
- `Dropdown.tsx` — generic select (replaces the 3 inline copies).
- `DatePicker.tsx` — date picker (extracted from `tasks/new`).
- `Button.tsx`, `Chip.tsx`, `EmptyState.tsx`, `Toast.tsx` (+ `ToastProvider`).
- (existing `Spinner.tsx`, `ErrorMessage.tsx` kept.)

**New shell/nav — `frontend/my-app/src/components/layout/`:**
- `Sidebar.tsx` — dark left nav, role-gated items, user/sign-out footer.
- `AppShell.tsx` — sidebar + content region; wraps protected pages.
- `nav.ts` — nav item config (label, href, icon, managerOnly).

**New routes — `frontend/my-app/src/app/`:**
- `board/page.tsx` — Kanban home + filter bar + reads `?task=`/`?project=`.
- `overview/page.tsx` — manager per-team dashboards (from `dashboard`).
- `manage/page.tsx` — tabbed Teams/Users (from `teams`+`users`).
- (existing `projects/page.tsx` modified; `login`/`register` unchanged.)

**New feature components — `frontend/my-app/src/components/`:**
- `task/TaskPanel.tsx` — slide-over task detail + create/edit (from `tasks/[id]` + `tasks/new`).
- `board/KanbanBoard.tsx`, `board/TaskCard.tsx`, `board/BoardFilters.tsx`.
- `manage/TeamsTab.tsx`, `manage/UsersTab.tsx`.

**New libs — `frontend/my-app/src/lib/`:**
- `taskImage.ts` — image-URL resolution (the bug fix).
- `hooks/useProjectVisibility.ts` — manager all/mine toggle + localStorage.

**Modified:** `app/page.tsx` (redirect → `/board`), `components/layout/ProtectedLayout.tsx` (use `AppShell`), `app/layout.tsx` (mount `ToastProvider`).

**Deleted (final task):** `app/dashboard`, `app/tasks` (page+new+[id]), `app/teams` (+[teamId]), `app/users`, `app/digest`, `app/projects/[projectId]`, old `components/layout/Navbar.tsx`.

---

## Task 1: Image-URL resolution util + apply the preview fix

Smallest, highest-value, independent. Fixes the "preview only after reload" bug now; the util is reused by the panel in Task 5.

**Files:**
- Create: `frontend/my-app/src/lib/taskImage.ts`
- Modify: `frontend/my-app/src/app/tasks/[id]/page.tsx` (interim fix; this page is replaced by the panel in Task 5 but we fix it here so the bug is gone immediately)

- [ ] **Step 1: Create the resolver util**

```ts
// frontend/my-app/src/lib/taskImage.ts
import api from "@/lib/api";

// The thumbnail (resized bucket) is produced ASYNCHRONOUSLY by the ImageResize
// Lambda, so right after upload it does not exist yet — and SVG/PDF are never
// resized. The ORIGINAL is available the instant the S3 PUT completes. So we
// fetch the original for an immediate, reliable preview, and (best-effort) the
// thumbnail to upgrade once it exists.
export async function fetchTaskImageUrls(
  taskId: string
): Promise<{ original: string | null; thumbnail: string | null }> {
  const [original, thumbnail] = await Promise.all([
    api
      .get(`/tasks/${taskId}/image-url`, { params: { variant: "original" } })
      .then((r) => (r.data?.url as string) ?? null)
      .catch(() => null),
    api
      .get(`/tasks/${taskId}/image-url`)
      .then((r) => (r.data?.url as string) ?? null)
      .catch(() => null),
  ]);
  return { original, thumbnail };
}
```

- [ ] **Step 2: Replace the detail page's upload + load image logic**

In `app/tasks/[id]/page.tsx`, replace the `handleUpload` body's preview/refetch block and the `useEffect` image fetch so the **original** is shown immediately (no `setTimeout(...,4000)`), with the thumbnail as a silent upgrade.

Replace the tail of `handleUpload` (the part after the `await fetch(uploadUrl, ...)` PUT) with:

```ts
      // optimistic local preview — instant, no reload
      const localUrl = URL.createObjectURL(f);
      setImageUrl(localUrl);
      setTask((t) => (t ? ({ ...t, imageKey: "pending" } as Task) : t));
      // reconcile with the server: original is available now; thumbnail upgrades later
      const { original, thumbnail } = await fetchTaskImageUrls(taskId);
      if (original || thumbnail) {
        URL.revokeObjectURL(localUrl);
        setImageUrl(thumbnail || original);
      }
```

Replace the image fetch inside the load `useEffect` (`if (t.imageKey) { api.get(... image-url ...) }`) with:

```ts
      if (t.imageKey) {
        fetchTaskImageUrls(taskId).then(({ original, thumbnail }) =>
          setImageUrl(thumbnail || original)
        );
      }
```

Add the import at the top: `import { fetchTaskImageUrls } from "@/lib/taskImage";`

- [ ] **Step 3: Make the `<img>` self-heal if the thumbnail 404s**

On the attachment `<img>` (around `tasks/[id]/page.tsx:364`), add an `onError` that falls back to the original variant once:

```tsx
<img
  src={imageUrl}
  alt="Attachment"
  className="w-full h-full object-cover group-hover:opacity-70 transition-opacity"
  onError={async (e) => {
    if (e.currentTarget.dataset.fellBack) return;
    e.currentTarget.dataset.fellBack = "1";
    const { original } = await fetchTaskImageUrls(taskId);
    if (original) e.currentTarget.src = original;
  }}
/>
```

- [ ] **Step 4: Verify**

Run: `cd frontend/my-app && npm run build && npm run lint`
Expected: build + lint pass.
Browser (against the live API, `npm run dev`): open a task, upload a PNG **and** an SVG → preview appears **immediately, without reload** for both; reload the page → still shows.

- [ ] **Step 5: Verify + handoff**
Changed files: `src/lib/taskImage.ts`, `src/app/tasks/[id]/page.tsx`. Hand off as the "image-fix" chunk.

---

## Task 2: Shared UI kit (SlideOver, Dropdown, DatePicker, Button, Chip, EmptyState, Toast)

Foundation reused by every later task. Extract the inline-duplicated components into one kit. Behavior/markup mirrors the current inline versions (Monolith Noir), just centralized.

**Files:**
- Create: `src/components/ui/SlideOver.tsx`, `Dropdown.tsx`, `DatePicker.tsx`, `Button.tsx`, `Chip.tsx`, `EmptyState.tsx`, `Toast.tsx`

- [ ] **Step 1: SlideOver shell** (used for the task panel and Manage modals)

```tsx
// src/components/ui/SlideOver.tsx
"use client";
import { useEffect } from "react";

export default function SlideOver({
  open, onClose, title, children, width = 460,
}: {
  open: boolean; onClose: () => void; title?: string;
  children: React.ReactNode; width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside
        className="absolute right-0 top-0 h-full bg-surface-container-low border-l border-outline-variant overflow-y-auto"
        style={{ width: `min(${width}px, 100vw)`, boxShadow: "-16px 0 40px rgba(0,0,0,0.5)" }}
      >
        {title && (
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-outline-variant bg-surface-container-low">
            <h2 className="text-sm font-semibold text-on-surface">{title}</h2>
            <button onClick={onClose} aria-label="Close"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Dropdown** — lift the `Dropdown` component verbatim from `app/tasks/new/page.tsx` (lines ~149-203) into `src/components/ui/Dropdown.tsx`, export as default, change nothing else. (It already matches the theme.)

- [ ] **Step 3: DatePicker** — lift the `DatePicker` component from `app/tasks/new/page.tsx` (lines ~19-146) into `src/components/ui/DatePicker.tsx`, export default.

- [ ] **Step 4: Button / Chip / EmptyState** — small primitives matching DESIGN.md:

```tsx
// src/components/ui/Button.tsx
"use client";
type Variant = "primary" | "secondary" | "ghost" | "danger";
const cls: Record<Variant, string> = {
  primary: "bg-primary text-surface-container-lowest hover:bg-primary/90",
  secondary: "border border-outline-variant text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface",
  ghost: "text-on-surface-variant hover:text-on-surface",
  danger: "text-error border border-[rgba(255,180,171,0.2)] bg-[rgba(255,180,171,0.05)] hover:bg-[rgba(255,180,171,0.1)]",
};
export default function Button({
  variant = "primary", className = "", ...props
}: { variant?: Variant } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${cls[variant]} ${className}`}
    />
  );
}
```

```tsx
// src/components/ui/EmptyState.tsx
export default function EmptyState({ title, hint, action }: {
  title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <p className="text-sm font-medium text-on-surface">{title}</p>
      {hint && <p className="text-xs text-on-surface-variant">{hint}</p>}
      {action}
    </div>
  );
}
```

```tsx
// src/components/ui/Chip.tsx
export default function Chip({ dot, color, children }: {
  dot?: string; color?: string; children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
      style={{ background: (color ?? "#8e9192") + "18", color: color ?? "#c4c7c8" }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />}
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Toast** — minimal context-based toaster for error/success (rubric "error toasts"):

```tsx
// src/components/ui/Toast.tsx
"use client";
import { createContext, useCallback, useContext, useState } from "react";
type Toast = { id: number; msg: string; kind: "error" | "success" };
const Ctx = createContext<(msg: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(Ctx);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: Toast["kind"] = "error") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id}
            className="px-4 py-3 rounded-lg text-sm border bg-surface-container-high text-on-surface"
            style={{ borderColor: t.kind === "error" ? "rgba(255,180,171,0.3)" : "#444748" }}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
```

- [ ] **Step 6: Mount ToastProvider** in `app/layout.tsx` — wrap `{children}` (inside `<body>`, inside the existing `AuthProvider` if present) with `<ToastProvider>`.

- [ ] **Step 7: Verify** — `npm run build && npm run lint` pass. (No visual change yet; kit is unused until later tasks.)

- [ ] **Step 8: Verify + handoff** — Changed files under `src/components/ui/*` + `app/layout.tsx`. "shared-kit" chunk.

---

## Task 3: App shell + dark sidebar + route redirects

**Files:**
- Create: `src/components/layout/nav.ts`, `src/components/layout/Sidebar.tsx`, `src/components/layout/AppShell.tsx`
- Modify: `src/components/layout/ProtectedLayout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Nav config**

```ts
// src/components/layout/nav.ts
export type NavItem = { label: string; href: string; managerOnly?: boolean; icon: string };
export const NAV: NavItem[] = [
  { label: "Board",    href: "/board",    icon: "board" },
  { label: "Projects", href: "/projects", icon: "projects" },
  { label: "Overview", href: "/overview", icon: "overview", managerOnly: true },
  { label: "Manage",   href: "/manage",   icon: "manage",   managerOnly: true },
];
```

- [ ] **Step 2: Sidebar** — dark, theme-consistent, role-gated, active-route highlight, user/role/sign-out footer. Reuse `useAuth()` (`user`, `isManager`, `logout`) exactly as the old `Navbar.tsx`. Render `NAV.filter(n => !n.managerOnly || isManager)`; mark active with `usePathname()`. Footer: `user.email`, role chip, Sign out (`await logout(); router.push("/login")`). Styling: `bg-surface-container-low border-r border-outline-variant`, fixed width 220px, full height; links `text-on-surface-variant hover:text-on-surface`, active = `bg-surface-container-high text-on-surface`.

- [ ] **Step 3: AppShell**

```tsx
// src/components/layout/AppShell.tsx
"use client";
import Sidebar from "./Sidebar";
export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 px-8 py-6" style={{ maxWidth: 1440 }}>{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Wire ProtectedLayout to AppShell** — in `ProtectedLayout.tsx`, replace the `<Navbar />` + wrapper markup with `<AppShell>{children}</AppShell>` (keep the existing auth-guard/redirect logic untouched).

- [ ] **Step 5: Landing redirect** — `app/page.tsx` becomes a redirect to `/board` (use `redirect("/board")` from `next/navigation` in a server component, or `router.replace` if it must stay client). Preserve any unauthenticated → `/login` behavior already present.

- [ ] **Step 6: Verify** — `npm run build && npm run lint`. Browser: log in as manager → sidebar shows Board/Projects/Overview/Manage; log in as employee → only Board/Projects; sidebar matches dark theme (no white bar); sign-out works. (Board/Overview/Manage pages may 404 until their tasks — acceptable mid-migration; old routes still reachable directly.)

- [ ] **Step 7: Verify + handoff** — `src/components/layout/{nav.ts,Sidebar.tsx,AppShell.tsx,ProtectedLayout.tsx}`, `src/app/page.tsx`. "shell-nav" chunk.

---

## Task 4: Board page (home) + filters (incl. Project filter + Due today)

Port the Kanban from `app/tasks/page.tsx` to `app/board/page.tsx`, extracted into components, with a compact filter bar. Card click sets `?task=<id>` (panel comes in Task 5).

**Files:**
- Create: `src/app/board/page.tsx`, `src/components/board/KanbanBoard.tsx`, `src/components/board/TaskCard.tsx`, `src/components/board/BoardFilters.tsx`

- [ ] **Step 1: Move board logic** — copy the data-loading, `normalizeStatus`, drag-and-drop handlers, and Kanban column rendering from `app/tasks/page.tsx` into `KanbanBoard.tsx` (board) + `TaskCard.tsx` (card). Keep drag-and-drop and the optimistic `PUT /tasks/:id { status }` behavior identical.

- [ ] **Step 2: BoardFilters** — compact bar using the shared `Dropdown`: Search · Team (manager only) · **Project** · Priority · **Due today** toggle chip. The Project options come from `GET /projects` (already fetched); "Due today" filters `deadline` startsWith today's `YYYY-MM-DD` and status ≠ Done (replaces `/digest`). Read initial `project` from `useSearchParams().get("project")` so `/board?project=<id>` deep-links work.

- [ ] **Step 3: Card click opens panel via URL** — `TaskCard` is a button that does `router.push(\`/board?task=\${taskId}\`, { scroll: false })` (instead of linking to `/tasks/[id]`). Manager "New task" button → `router.push("/board?task=new")`.

- [ ] **Step 4: board/page.tsx** — wraps everything in `ProtectedLayout` (→ AppShell), renders `BoardFilters` + `KanbanBoard`, and (placeholder for Task 5) reads `?task=`.

- [ ] **Step 5: Verify** — `npm run build && npm run lint`. Browser: `/board` shows the Kanban with drag-drop working; team/project/priority/search/Due-today filters work; manager sees Team filter, employee doesn't; `/board?project=<id>` pre-filters. (Clicking a card changes the URL but panel renders in Task 5.)

- [ ] **Step 6: Verify + handoff** — `src/app/board/*`, `src/components/board/*`. "board" chunk.

---

## Task 5: Task slide-over panel (detail + create/edit) + image fix reuse

Replace the `/tasks/[id]` page and `/tasks/new` page with one `TaskPanel` rendered inside the board when `?task=` is present (`?task=new` = create, `?task=<id>` = detail/edit). Port content verbatim from the two existing pages; use `SlideOver` + `taskImage.ts`.

**Files:**
- Create: `src/components/task/TaskPanel.tsx`
- Modify: `src/app/board/page.tsx` (mount the panel)

- [ ] **Step 1: TaskPanel — detail mode** — port the detail layout from `app/tasks/[id]/page.tsx` (status dropdown, details, attachment with the Task 1 image fix, comments thread + input, `ActivityFeed`, manager edit/delete) into the `SlideOver`. `taskId` comes from the `task` prop; on close, `router.push("/board", { scroll: false })`. On status/assignment/image/comment changes, call an `onChanged()` prop so the board updates without a full refetch.

- [ ] **Step 2: TaskPanel — create/edit mode** — port the form from `app/tasks/new/page.tsx` (title/desc/priority/deadline/team/project/assignee + image) using shared `Dropdown`/`DatePicker`. `task === "new"` → create (`POST /tasks` then optional image upload, exactly as today); editing reuses the same form pre-filled (replacing the old `/tasks/new?edit=` flow). On success, close panel and refresh the board list; show errors via `useToast()`.

- [ ] **Step 3: Mount in board** — in `board/page.tsx`, read `const taskParam = useSearchParams().get("task")` and render `{taskParam && <TaskPanel task={taskParam} onClose={...} onChanged={refetchBoard} />}`.

- [ ] **Step 4: Verify** — `npm run build && npm run lint`. Browser: click a card → panel slides over the board (no navigation); Esc/backdrop/Back closes it; refresh on `/board?task=<id>` reopens it; comments post; status change reflects on the board card; manager "New task" creates via panel and the card appears; **image upload preview is immediate (Task 1 fix), incl. SVG**; employee cannot open another team's task (server returns 403 → toast).

- [ ] **Step 5: Verify + handoff** — `src/components/task/TaskPanel.tsx`, `src/app/board/page.tsx`. "task-panel" chunk.

---

## Task 6: Overview (manager per-team dashboards)

**Files:**
- Create: `src/app/overview/page.tsx`

- [ ] **Step 1: Build Overview** — manager/admin only (redirect employees to `/board`). Fetch `GET /tasks` (manager → all) + `GET /teams`. Group tasks by `teamId`; render one card per team with counts by status (To Do/In Progress/In Review/Done), overdue count (`deadline < today && status ≠ Done`), and total. Each card links to `/board?team=<id>` (or sets the board team filter). Reuse `STATUS_CONFIG` colors and the existing dashboard's data shape. Keep loading skeleton + `EmptyState` when no teams/tasks.

- [ ] **Step 2: Verify** — `npm run build && npm run lint`. Browser: manager `/overview` shows per-team cards with correct counts; clicking a team opens the board filtered to it; employee visiting `/overview` is redirected to `/board`.

- [ ] **Step 3: Verify + handoff** — `src/app/overview/page.tsx`. "overview" chunk.

---

## Task 7: Manage (Teams + Users tabs)

**Files:**
- Create: `src/app/manage/page.tsx`, `src/components/manage/TeamsTab.tsx`, `src/components/manage/UsersTab.tsx`

- [ ] **Step 1: Manage shell** — manager/admin only (redirect others to `/board`). Tab switcher (Teams | Users) via local state; render the active tab.

- [ ] **Step 2: TeamsTab** — port team list + create from `app/teams/page.tsx`; "Create team" opens a `SlideOver` (or modal) with the create form (`POST /teams`); list shows teams with member counts; edit via the same panel. Use `useToast()` for errors.

- [ ] **Step 3: UsersTab** — port from `app/users/page.tsx`: list users with role + team; assign/change team and role via a `SlideOver` form (existing endpoints). Keep the server as source of truth (refetch after mutation).

- [ ] **Step 4: Verify** — `npm run build && npm run lint`. Browser: manager `/manage` → Teams tab lists/creates teams; Users tab lists users and assigns team/role; employee redirected to `/board`.

- [ ] **Step 5: Verify + handoff** — `src/app/manage/*`, `src/components/manage/*`. "manage" chunk.

---

## Task 8: Projects — visible filter + manager "All vs. Created by me" toggle

**Files:**
- Create: `src/lib/hooks/useProjectVisibility.ts`
- Modify: `src/app/projects/page.tsx`, `src/components/board/BoardFilters.tsx`

- [ ] **Step 1: Visibility hook**

```ts
// src/lib/hooks/useProjectVisibility.ts
"use client";
import { useEffect, useState } from "react";
export type ProjectScope = "all" | "mine";
const KEY = "syncora.projectScope";
export function useProjectVisibility() {
  const [scope, setScope] = useState<ProjectScope>("all");
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v === "all" || v === "mine") setScope(v);
  }, []);
  const update = (s: ProjectScope) => { setScope(s); localStorage.setItem(KEY, s); };
  return { scope, setScope: update };
}

// Filter helper (pure — verify by inspection):
// projects.filter(p => scope === "all" || p.createdBy === currentUserSub)
export function scopeProjects<T extends { createdBy?: string }>(
  projects: T[], scope: ProjectScope, currentUserSub: string | undefined
): T[] {
  if (scope === "all" || !currentUserSub) return projects;
  return projects.filter((p) => p.createdBy === currentUserSub);
}
```

- [ ] **Step 2: Confirm the current-user id field** — check what `useAuth()`'s `user` exposes for the Cognito `sub` (the value stored in `project.createdBy`). Read `src/context/AuthContext.tsx` / `src/hooks/useAuth.ts`. Use that field as `currentUserSub`. If only `userId` exists and it equals the Cognito sub, use it; otherwise decode `sub` from the id token where the context already does.

- [ ] **Step 3: Projects page toggle** — in `app/projects/page.tsx`, for managers/admins render a segmented toggle "All projects | Created by me" bound to `useProjectVisibility()`, and apply `scopeProjects(projects, scope, sub)` to the rendered list. Employees: no toggle (unchanged). Each project card links to `/board?project=<projectId>`.

- [ ] **Step 4: Board project-filter respects scope** — in `BoardFilters.tsx`, when the user is a manager, feed the Project dropdown options through `scopeProjects(..., scope, sub)` so the board's project options match the chosen visibility.

- [ ] **Step 5: Verify** — `npm run build && npm run lint`. Browser: as a manager with ≥2 managers' projects seeded, toggle "Created by me" → list shrinks to your projects; reload → choice persists; "All projects" → full org list; board Project filter options follow the toggle; employee sees only their team's projects with no toggle.

- [ ] **Step 6: Verify + handoff** — `src/lib/hooks/useProjectVisibility.ts`, `src/app/projects/page.tsx`, `src/components/board/BoardFilters.tsx`. "projects" chunk.

---

## Task 9: Cleanup — remove dead routes, declutter pass, rubric verification

Only after Tasks 3–8 are verified working.

**Files (delete):** `src/app/dashboard/`, `src/app/tasks/` (page.tsx, new/, [id]/), `src/app/teams/` (+[teamId]), `src/app/users/`, `src/app/digest/`, `src/app/projects/[projectId]/`, `src/components/layout/Navbar.tsx`

- [ ] **Step 1: Grep for stale references** — Run a search for any remaining links/imports to the deleted paths: `/tasks`, `/dashboard`, `/teams`, `/users`, `/digest`, `Navbar`. Replace `/tasks` links with `/board`, `/tasks/[id]` with `/board?task=`, `/dashboard` with `/overview`, etc. (Likely spots: `Sidebar`, `TaskCard`, breadcrumb/back links inside the panel, any `Link href="/tasks..."`.)

- [ ] **Step 2: Delete the dead routes/components** listed above.

- [ ] **Step 3: Declutter pass** — on Board cards and the panel, reduce competing chrome per DESIGN.md (fewer borders/badges, more whitespace, quieter summary pills), keeping loading skeletons, empty states (`EmptyState`), and toasts.

- [ ] **Step 4: Full verify** — `npm run build && npm run lint` (no broken imports). Browser run the **spec success criteria (Section 12)** end-to-end as manager *and* employee:
  - ~5 routes; dark sidebar; no white nav.
  - Task detail + create/edit in slide-over, deep-linkable, Esc/Back closes.
  - Image preview immediate after upload (png/jpg/svg/pdf), no reload.
  - Board Project filter + manager All/Created-by-me toggle (persisted).
  - Overview per-team dashboards; Manage Teams+Users CRUD.
  - Kanban drag-drop, comments, activity log, role/team isolation (employee 403 on other team's task), attachments, toasts, loading/empty states all work.

- [ ] **Step 5: Verify + handoff** — list every deleted/modified file. "cleanup" chunk. Note for the user: this is the chunk that makes the new IA the only IA — apply it last and re-verify the live demo before shipping.

---

## Self-review notes (author)

- **Spec coverage:** IA/routes → T3,T9; board+panels → T4,T5; Overview → T6; Manage → T7; project filter + toggle → T8; image bug → T1; declutter/shared-kit → T2,T9. All spec sections mapped.
- **No backend tasks** — consistent with the spec (frontend-only).
- **Type/name consistency:** `fetchTaskImageUrls`, `scopeProjects`/`useProjectVisibility`, `SlideOver`, `AppShell`, `NAV` used consistently across tasks.
- **Runnability:** new routes are added alongside old ones; deletions happen only in T9, so the app builds and runs after every task.
