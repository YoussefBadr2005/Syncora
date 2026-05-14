# Mini-Jira Backend

Express + TypeScript REST API for the Mini-Jira AWS project (Phase 3).

## Local dev

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev
```

Health check: `GET http://localhost:3000/api/health`

All `/api/*` routes (except `/api/health`) require `Authorization: Bearer <Cognito access token>`.

## Build

```bash
npm run build
npm start
```

## Routes

| Method | Path | Access |
|---|---|---|
| GET | `/api/health` | public |
| GET | `/api/users/me` | any authenticated user |
| GET/POST | `/api/users` | manager/admin |
| GET/POST | `/api/teams` | manager/admin |
| POST | `/api/teams/:id/members` | manager/admin |
| POST/PUT/DELETE | `/api/projects` | manager/admin |
| GET | `/api/projects` | manager → all, employee → own team |
| POST | `/api/tasks` | manager/admin |
| GET | `/api/tasks` | manager → all, employee → own team (via `teamId-index`) |
| PUT | `/api/tasks/:id` | manager → any field, employee → `status` only |
| DELETE | `/api/tasks/:id` | manager/admin |
| GET/POST | `/api/tasks/:id/comments` | team-checked |
| POST | `/api/tasks/:id/image` | team-checked, returns pre-signed S3 PUT URL |
| GET | `/api/tasks/:id/image-url` | team-checked, pre-signed GET (`?variant=original\|thumbnail`) |
| DELETE | `/api/tasks/:id/image` | manager/admin |

## Side effects

- Task create / reassign → SNS `TaskAssignmentTopic` publish.
- Task status change → row in `StatusLogs`. Transition to `Done` emits `MiniJira/TasksClosed` (dim: `TeamId`).
- Task create emits `MiniJira/TasksCreated` (dim: `TeamId`).
- Image upload → DynamoDB updated with `imageKey` + (pre-computed) `thumbnailKey`; the resize Lambda from Phase 5 produces the actual thumbnail object.
