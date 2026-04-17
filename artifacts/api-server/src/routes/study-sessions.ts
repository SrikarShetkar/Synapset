import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, studySessionsTable, revisionScheduleTable, usersTable } from "@workspace/db";
import {
  CreateStudySessionBody,
  GetStudySessionParams,
  DeleteStudySessionParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_USER_ID = 1;

const REVISION_INTERVALS_DAYS = [1, 3, 7, 14, 30];

function scheduleRevisions(sessionId: number) {
  const now = new Date();
  return REVISION_INTERVALS_DAYS.map((days) => {
    const nextRevision = new Date(now);
    nextRevision.setDate(nextRevision.getDate() + days);
    return { sessionId, nextRevision, completed: false, retentionScore: 1.0 };
  });
}

router.get("/study-sessions", async (req, res): Promise<void> => {
  const sessions = await db.select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.userId, DEFAULT_USER_ID))
    .orderBy(desc(studySessionsTable.createdAt));

  res.json(sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    topic: s.topic,
    duration: s.duration,
    difficulty: s.difficulty,
    notes: s.notes ?? null,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.post("/study-sessions", async (req, res): Promise<void> => {
  const parsed = CreateStudySessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.insert(studySessionsTable).values({
    userId: DEFAULT_USER_ID,
    topic: parsed.data.topic,
    duration: parsed.data.duration,
    difficulty: parsed.data.difficulty,
    notes: parsed.data.notes ?? null,
  }).returning();

  await db.insert(revisionScheduleTable).values(scheduleRevisions(session.id));

  await db.update(usersTable)
    .set({ xp: db.$count(studySessionsTable, eq(studySessionsTable.userId, DEFAULT_USER_ID)) })
    .where(eq(usersTable.id, DEFAULT_USER_ID));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, DEFAULT_USER_ID));
  if (user) {
    const newXp = user.xp + parsed.data.duration * parsed.data.difficulty;
    const newLevel = Math.floor(newXp / 200) + 1;
    await db.update(usersTable)
      .set({ xp: newXp, level: newLevel })
      .where(eq(usersTable.id, DEFAULT_USER_ID));
  }

  res.status(201).json({
    id: session.id,
    userId: session.userId,
    topic: session.topic,
    duration: session.duration,
    difficulty: session.difficulty,
    notes: session.notes ?? null,
    createdAt: session.createdAt.toISOString(),
  });
});

router.get("/study-sessions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetStudySessionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json({
    id: session.id,
    userId: session.userId,
    topic: session.topic,
    duration: session.duration,
    difficulty: session.difficulty,
    notes: session.notes ?? null,
    createdAt: session.createdAt.toISOString(),
  });
});

router.delete("/study-sessions/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteStudySessionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.delete(studySessionsTable)
    .where(eq(studySessionsTable.id, params.data.id))
    .returning();

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
