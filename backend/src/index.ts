import express from "express";
import cors from "cors";
import { config } from "./config";
import { authMiddleware } from "./middleware/auth";
import { enforceTeamAccess } from "./middleware/teamGuard";
import { enforceOrgAccess } from "./middleware/orgGuard";
import { errorHandler, notFound } from "./middleware/error";
import projectsRouter from "./routes/projects";
import { tasksRouter } from "./routes/tasks";
import commentsRouter from "./routes/comments";
import imagesRouter from "./routes/images";
import teamsRouter from "./routes/teams";
import usersRouter from "./routes/users";
import activityRouter from "./routes/activity";
import authRouter from "./routes/auth";
import organizationsRouter from "./routes/organizations";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

// Public routes — no auth required
app.use("/api/auth", authRouter);

// Protected routes — require valid Cognito JWT + an org claim
const protect = [authMiddleware, enforceOrgAccess, enforceTeamAccess];
app.use("/api/projects",      protect, projectsRouter);
app.use("/api/tasks",         protect, tasksRouter);
app.use("/api/tasks",         protect, commentsRouter);
app.use("/api/tasks",         protect, imagesRouter);
app.use("/api/teams",         protect, teamsRouter);
app.use("/api/users",         protect, usersRouter);
app.use("/api/activity",      protect, activityRouter);
app.use("/api/organizations", protect, organizationsRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[mini-jira-api] listening on :${config.port}`);
});
