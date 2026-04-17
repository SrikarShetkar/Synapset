import { Router, type IRouter } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db, revisionScheduleTable, studySessionsTable } from "@workspace/db";
import { GetRevisionsQueryParams, CompleteRevisionParams } from "@workspace/api-zod";
import { calculateRetention } from "../lib/retention";

const router: IRouter = Router();

router.get("/revisions", async (req, res): Promise<void> => {
  const params = GetRevisionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const conditions = [];
  if (params.data.completed !== undefined) {
    conditions.push(eq(revisionScheduleTable.completed, params.data.completed));
  }

  const revisions = await db.select({
    id: revisionScheduleTable.id,
    sessionId: revisionScheduleTable.sessionId,
    nextRevision: revisionScheduleTable.nextRevision,
    completed: revisionScheduleTable.completed,
    retentionScore: revisionScheduleTable.retentionScore,
    topic: studySessionsTable.topic,
    difficulty: studySessionsTable.difficulty,
    createdAt: studySessionsTable.createdAt,
  })
    .from(revisionScheduleTable)
    .innerJoin(studySessionsTable, eq(revisionScheduleTable.sessionId, studySessionsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(revisionScheduleTable.nextRevision));

  const now = new Date();
  res.json(revisions.map((r) => {
    const daysSinceStudy = (now.getTime() - r.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const retentionScore = calculateRetention(daysSinceStudy, r.difficulty) * 100;
    return {
      id: r.id,
      sessionId: r.sessionId,
      topic: r.topic,
      nextRevision: r.nextRevision.toISOString(),
      completed: r.completed,
      retentionScore,
      daysSinceStudy,
    };
  }));
});

router.post("/revisions/:id/complete", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CompleteRevisionParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [revision] = await db.select({
    id: revisionScheduleTable.id,
    sessionId: revisionScheduleTable.sessionId,
    nextRevision: revisionScheduleTable.nextRevision,
    completed: revisionScheduleTable.completed,
    retentionScore: revisionScheduleTable.retentionScore,
    topic: studySessionsTable.topic,
    difficulty: studySessionsTable.difficulty,
    createdAt: studySessionsTable.createdAt,
  })
    .from(revisionScheduleTable)
    .innerJoin(studySessionsTable, eq(revisionScheduleTable.sessionId, studySessionsTable.id))
    .where(eq(revisionScheduleTable.id, params.data.id));

  if (!revision) {
    res.status(404).json({ error: "Revision not found" });
    return;
  }

  await db.update(revisionScheduleTable)
    .set({ completed: true, retentionScore: 1.0 })
    .where(eq(revisionScheduleTable.id, params.data.id));

  const now = new Date();
  const daysSinceStudy = (now.getTime() - revision.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  res.json({
    id: revision.id,
    sessionId: revision.sessionId,
    topic: revision.topic,
    nextRevision: revision.nextRevision.toISOString(),
    completed: true,
    retentionScore: 100,
    daysSinceStudy,
  });
});

export default router;
