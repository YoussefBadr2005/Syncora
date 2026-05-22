# Syncora — Minimal Board-Centric UI Redesign (Design Spec)

**Date:** 2026-05-22
**Status:** Draft for review
**Scope owner:** Frontend (Next.js 16 app in `frontend/my-app`)
**Backend impact:** None required (all changes are frontend; existing APIs already support what we need)

---

## 1. Goal & motivation

The app already uses a clean, minimal dark aesthetic ("Monolith Noir", Linear/Vercel-style), so the win is **not** restyling — it's **information architecture, flow friction, and consistency**. Three user-chosen objectives:

1. **Trim surface area / navigation** — collapse ~13 routes into ~5 so there's less to learn.
2. **Reduce flow friction** — make task interactions feel "seamless" (no full-page navigation for task detail/create).
3. **Declutter screens** — more breathing room, less competing chrome.

Plus two colleague-requested features and one bug, folded into the same pass (Sections 7–8).

**Hard constraint:** Every rubric capability must remain present and visible (Kanban board with drag-and-drop, task detail *modal* with comments, projects/teams/users CRUD, per-team manager dashboards, server-side role/team isolation, image attachments, loading/empty states, error toasts). This redesign reorganizes *presentation*, never removes capability. The Kanban board + task-detail-modal pattern is itself a rubric requirement, so this direction is rubric-aligned.

---

## 2. In scope / out of scope

**In scope (this spec):**
- New navigation shell (dark left sidebar) replacing the off-theme white Navbar.
- Board as home; task detail + create/edit as right-hand slide-over panels.
- Manager **Overview** (per-team dashboards) and tabbed **Manage** (Teams / Users).
- Project filter on the board; manager "All projects vs. Created by me" toggle.
- Image-preview-after-upload bug fix.
- Declutter pass + extraction of a small shared component kit (as we touch each surface).

**Out of scope (separate sub-projects, not this spec):** SSO/Google login, CI/CD, the AI "record → tasks" feature, broad repo/comment cleanup, backend changes, mobile-specific optimization. Desktop-first. Theme stays Monolith Noir (dark).

---

## 3. Information architecture & routes

**Navigation shell:** a slim **dark left sidebar** (consistent with Monolith Noir), replacing `components/layout/Navbar.tsx` (currently `bg-white`/indigo — off-theme).

Sidebar items:
- **Board** (home) — everyone
- **Projects** — everyone (employees read-only; managers full)
- **Overview** — managers/admins only
- **Manage** — managers/admins only (Teams / Users tabs)
- Pinned bottom: user email, role chip, Sign out.

**Route map (before → after):**

| Before | After |
|---|---|
| `/` (landing) | redirect → `/board` |
| `/dashboard` | `/overview` (manager per-team dashboards) |
| `/tasks` (board+list) | `/board` (home) |
| `/tasks/[id]` | slide-over panel on `/board?task=<id>` |
| `/tasks/new` (+ `?edit=`) | slide-over "create/edit" panel on `/board` |
| `/projects` | `/projects` (kept; gains filters/toggle) |
| `/projects/[projectId]` | `/board?project=<id>` (project click filters the board) |
| `/teams`, `/teams/[teamId]` | `/manage` → Teams tab |
| `/users` | `/manage` → Users tab |
| `/digest` | removed → "Due today" filter chip on the board |
| `/login`, `/register` | unchanged |

Net: **~13 → ~5** top-level routes. Deep links preserved via query params (`?task=`, `?project=`).

---

## 4. Board (home) + slide-over panels

**Board:** keep the Kanban columns (To Do / In Progress / In Review / Done) and drag-and-drop. A single compact **filter bar**: search · Team (manager) · **Project** · Priority · **Due today** chip. Status summary pills retained but visually quieted (declutter).

**Task slide-over panel** (replaces the `/tasks/[id]` page; satisfies the rubric "task detail modal"):
- Opens from a card click or the `?task=<id>` URL param; closes on Esc / backdrop / browser-Back.
- Contents (ported from the current detail page): header (#id, title), status dropdown, priority/deadline/team/project/assignee details, **image attachment**, **comments thread**, **activity/audit history** (`ActivityFeed`), and manager actions (edit, delete).
- Inline edit happens in the panel; "New task" (manager) opens the same panel in create mode. User never leaves the board.

**Why a panel, not a route:** removes full-page reloads (the "seamless" goal), keeps board context visible, and matches the rubric's modal requirement. Deep-linkability via `?task=` preserves shareable URLs and refresh behavior.

---

## 5. Overview (manager) — preserves "per-team dashboards"

A manager/admin surface (`/overview`) showing **per-team cards**: task counts by status, overdue count, and simple throughput, each linking into a team-filtered board (`/board?team=<id>`). Reuses the data the current `/dashboard` already fetches, reorganized per team. This is the rubric's "per-team dashboards" requirement, kept intact.

---

## 6. Manage (manager) — Teams + Users consolidation

One route `/manage` with two tabs, replacing four routes (`/teams`, `/teams/[id]`, `/users`, and the management bits):
- **Teams tab:** list teams, create team (modal), view/edit.
- **Users tab:** list users, assign to a team / set role (modal).

Covers the rubric's "create teams" and "add users to teams". Create/edit use the shared slide-over/modal pattern rather than dedicated pages.

---

## 7. Project features (frontend-only)

Backend already supports both — `Project.createdBy` is set on creation ([projects.ts:42](../../../backend/src/routes/projects.ts)) and managers' `GET /projects` returns the whole org.

- **7a. Project filter on the board:** a visible Project dropdown in the filter bar (surfaces the `?project=` plumbing the old `/tasks` page already had). Options come from the projects the user can see.
- **7b. Manager "All projects vs. Created by me" toggle:** manager/admin-only control on the Projects view (and it scopes the board's project-filter options). Default **All projects** (company-wide — matches the rubric's manager-visibility rule). "Created by me" filters client-side on `project.createdBy === currentUser.sub`. Choice persisted in `localStorage`. Employees unaffected (still their team's projects only).
  - *Implementation note:* confirm the frontend auth user exposes the Cognito `sub` (the value stored in `createdBy`); if the client uses a different id field, map it. No API change.

---

## 8. Bug fix — image preview only appears after reload

**Root cause:** `POST /tasks/:id/image` sets `imageKey` + `thumbnailKey` synchronously, but `GET /tasks/:id/image-url` defaults to the **thumbnail** variant ([images.ts:50-52](../../../backend/src/routes/images.ts)), which the ImageResize Lambda generates **asynchronously** from the S3 PUT. So immediately after upload the thumbnail doesn't exist yet → the preview is blank until a reload (by which time the Lambda has run). SVG/PDF are never resized, so their preview would never appear.

**Fix (frontend-only):**
- Preview the **original** variant (`GET /tasks/:id/image-url?variant=original`) — available the instant the S3 PUT completes, and works for every allowed file type.
- Optionally upgrade to the thumbnail when it exists, via an `<img onError>` fallback (try thumbnail → fall back to original) rather than the current fixed `setTimeout(..., 4000)`.
- Keep the optimistic local `URL.createObjectURL` preview on upload; reconcile to the server URL once resolved.
- Apply this in the new task slide-over panel and the create flow so the preview shows immediately, no reload.

---

## 9. Declutter + shared component kit

As each surface is rebuilt, extract the currently **inline-duplicated** UI into a small shared kit and reduce chrome:
- `Sidebar`, `SlideOver` (panel/modal shell), `Dropdown`/`Select`, `DatePicker`, `Card`, `Button`, `Chip/Badge`, `Toast`, `EmptyState`, `Spinner`.
- Today `Dropdown`, `DatePicker`, `FilterDropdown`, status dropdowns, etc. are re-implemented per page (e.g. in `tasks/new/page.tsx`, `tasks/page.tsx`, `tasks/[id]/page.tsx`). Consolidating them removes code and makes every screen behave identically.
- Declutter: fewer borders/badges per card, more whitespace, consistent 4px spacing scale, quieter summary pills. Keep loading skeletons, empty states, and error toasts (rubric).

This is opportunistic (done where we already touch code), not a standalone refactor of untouched files.

---

## 10. Component / data boundaries

- **Shell:** `AppShell` (sidebar + content) wraps protected pages; replaces `ProtectedLayout`'s use of the old Navbar.
- **Board:** `BoardPage` (data fetch + filters) → `KanbanColumn` → `TaskCard`; `TaskPanel` (slide-over) reads `?task=` and owns detail/edit/create.
- **Data flow unchanged:** same REST endpoints (`/tasks`, `/projects`, `/teams`, `/users`, comments, image). Role/team isolation stays **server-side** (already enforced); the UI only changes how results are presented/filtered. No new endpoints.
- **State:** board holds the task list; the panel updates it optimistically on status/assignment/image changes (as the current detail page already does) so the board reflects edits without a full refetch.

---

## 11. Risks & rollout

- **Demo safety:** all work happens on the worktree. The **live CloudFront demo is not touched** until you verify locally and decide to ship. No backend redeploy is required for this work.
- **Regression risk:** medium (touches most screens). Mitigation: keep endpoints/contracts identical; verify the rubric checklist (Section 12) in the browser before shipping.
- **Git/contribution:** per project norms, changes are delivered as **local files/diffs grouped by area** (shell/nav, board+panel, overview, manage, projects, image-fix, shared-kit) so they can be split across teammates for contribution credit. **No pushes or PRs from me.**

---

## 12. Success criteria (verify before ship)

- Top-level routes reduced to ~5; sidebar is dark/consistent; no off-theme white nav.
- Task detail **and** create/edit happen in a slide-over over the board, deep-linkable via `?task=`, with Esc/back closing it — no full-page navigation.
- **Image preview appears immediately after upload with no reload, for jpg/png/svg/pdf.**
- Board has a working Project filter; managers can toggle "All projects / Created by me" and it persists.
- Manager Overview shows per-team dashboards; Manage handles Teams + Users CRUD.
- All rubric features still work: Kanban drag-drop, comments, audit/activity log, projects/teams/users CRUD, role/team isolation (employee can't see another team's tasks), attachments, toasts, loading/empty states.

---

## 13. Open questions

- None blocking. Minor: confirm the frontend user object exposes Cognito `sub` for the project "Created by me" filter (Section 7b) — verified during implementation.
