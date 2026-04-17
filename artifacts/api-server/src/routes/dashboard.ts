import { Router, type IRouter } from "express";
import { eq, desc, and, gte } from "drizzle-orm";
import { db, studySessionsTable, revisionScheduleTable, focusSessionsTable, brainBreaksTable, usersTable } from "@workspace/db";
import { GetRetentionCurveParams } from "@workspace/api-zod";
import { calculateRetention, generateCurvePoints, getOptimalRevisionDay } from "../lib/retention";

const router: IRouter = Router();

const DEFAULT_USER_ID = 1;

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, DEFAULT_USER_ID));

  if (!user) {
    [user] = await db.insert(usersTable).values({
      name: "Demo Student",
      email: "demo@synapset.ai",
      xp: 450,
      streak: 7,
      level: 3,
    }).returning();
  }

  const sessions = await db.select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.userId, DEFAULT_USER_ID))
    .orderBy(desc(studySessionsTable.createdAt));

  const now = new Date();

  const topicMap = new Map<string, { session: typeof sessions[0]; daysSince: number; retention: number }>();
  for (const s of sessions) {
    if (!topicMap.has(s.topic)) {
      const daysSince = (now.getTime() - s.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      const retention = calculateRetention(daysSince, s.difficulty) * 100;
      topicMap.set(s.topic, { session: s, daysSince, retention });
    }
  }

  const revisions = await db.select({
    id: revisionScheduleTable.id,
    sessionId: revisionScheduleTable.sessionId,
    nextRevision: revisionScheduleTable.nextRevision,
    completed: revisionScheduleTable.completed,
  })
    .from(revisionScheduleTable)
    .where(eq(revisionScheduleTable.completed, false))
    .orderBy(revisionScheduleTable.nextRevision);

  const nextRevisionBySession = new Map<number, Date>();
  for (const r of revisions) {
    if (!nextRevisionBySession.has(r.sessionId)) {
      nextRevisionBySession.set(r.sessionId, r.nextRevision);
    }
  }

  const subjectCards = Array.from(topicMap.values()).map(({ session, daysSince, retention }) => ({
    topic: session.topic,
    retentionPercent: Math.round(retention * 10) / 10,
    daysSinceStudy: Math.round(daysSince * 10) / 10,
    nextRevisionDate: nextRevisionBySession.get(session.id)?.toISOString() ?? null,
    isUrgent: retention < 40,
    sessionId: session.id,
  }));

  const focusSessions = await db.select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, DEFAULT_USER_ID));

  const totalBrainBreaks = await db.select()
    .from(brainBreaksTable)
    .where(eq(brainBreaksTable.userId, DEFAULT_USER_ID));

  const avgFocusScore = focusSessions.length > 0
    ? focusSessions.reduce((a, b) => a + b.focusConsistencyScore, 0) / focusSessions.length
    : 0;

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      xp: user.xp,
      streak: user.streak,
      level: user.level,
    },
    subjectCards,
    totalStudySessions: sessions.length,
    totalFocusSessions: focusSessions.length,
    totalBrainBreaks: totalBrainBreaks.length,
    avgFocusScore: Math.round(avgFocusScore * 10) / 10,
  });
});

router.get("/dashboard/retention-curve/:sessionId", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
  const params = GetRetentionCurveParams.safeParse({ sessionId: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.id, params.data.sessionId));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const now = new Date();
  const daysSince = (now.getTime() - session.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const currentRetention = calculateRetention(daysSince, session.difficulty) * 100;
  const optimalRevisionDay = getOptimalRevisionDay(session.difficulty);
  const dataPoints = generateCurvePoints(session.difficulty, 30);

  res.json({
    sessionId: session.id,
    topic: session.topic,
    difficulty: session.difficulty,
    dataPoints,
    currentRetention: Math.round(currentRetention * 10) / 10,
    optimalRevisionDay: Math.round(optimalRevisionDay * 10) / 10,
  });
});

router.get("/dashboard/focus-heatmap", async (req, res): Promise<void> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90);

  const sessions = await db.select()
    .from(focusSessionsTable)
    .where(and(
      eq(focusSessionsTable.userId, DEFAULT_USER_ID),
      gte(focusSessionsTable.timestamp, thirtyDaysAgo)
    ))
    .orderBy(focusSessionsTable.timestamp);

  const dateMap = new Map<string, { totalScore: number; count: number }>();
  for (const s of sessions) {
    const dateStr = s.timestamp.toISOString().split("T")[0];
    const existing = dateMap.get(dateStr) ?? { totalScore: 0, count: 0 };
    existing.totalScore += s.focusConsistencyScore;
    existing.count += 1;
    dateMap.set(dateStr, existing);
  }

  const heatmap = Array.from(dateMap.entries()).map(([date, { totalScore, count }]) => ({
    date,
    score: Math.round(totalScore / count * 10) / 10,
    sessionCount: count,
  }));

  res.json(heatmap);
});

router.get("/dashboard/urgent-revisions", async (req, res): Promise<void> => {
  const sessions = await db.select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.userId, DEFAULT_USER_ID));

  const now = new Date();
  const urgent = [];

  for (const session of sessions) {
    const daysSince = (now.getTime() - session.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const retention = calculateRetention(daysSince, session.difficulty) * 100;

    if (retention < 50) {
      const [revision] = await db.select()
        .from(revisionScheduleTable)
        .where(and(
          eq(revisionScheduleTable.sessionId, session.id),
          eq(revisionScheduleTable.completed, false)
        ))
        .orderBy(revisionScheduleTable.nextRevision)
        .limit(1);

      const overdueDays = revision
        ? Math.max(0, (now.getTime() - revision.nextRevision.getTime()) / (1000 * 60 * 60 * 24))
        : daysSince;

      urgent.push({
        revisionId: revision?.id ?? session.id,
        sessionId: session.id,
        topic: session.topic,
        retentionScore: Math.round(retention * 10) / 10,
        daysSinceStudy: Math.round(daysSince * 10) / 10,
        overdueDays: Math.round(overdueDays * 10) / 10,
      });
    }
  }

  urgent.sort((a, b) => a.retentionScore - b.retentionScore);
  res.json(urgent.slice(0, 10));
});

export default router;
