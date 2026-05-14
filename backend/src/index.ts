import express from "express";
import cors from "cors";
import { config } from "./config";
import { authMiddleware } from "./middleware/auth";
import { enforceTeamAccess } from "./middleware/teamGuard";
import { errorHandler, notFound } from "./middleware/error";
import projectsRouter from "./routes/projects";
import { tasksRouter } from "./routes/tasks";
import commentsRouter from "./routes/comments";
import imagesRouter from "./routes/images";
import teamsRouter from "./routes/teams";
import usersRouter from "./routes/users";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api", authMiddleware, enforceTeamAccess);

app.use("/api/projects", projectsRouter);
app.use("/api/tasks", tasksRouter);
app.use("/api/tasks", commentsRouter);
app.use("/api/tasks", imagesRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/users", usersRouter);

app.use(notFound);
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`[mini-jira-api] listening on :${config.port}`);
});
