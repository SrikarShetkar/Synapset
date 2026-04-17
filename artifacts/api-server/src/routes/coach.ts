import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, studySessionsTable, revisionScheduleTable, focusSessionsTable, brainBreaksTable, usersTable } from "@workspace/db";
import { CoachChatBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { calculateRetention } from "../lib/retention";

const router: IRouter = Router();

const DEFAULT_USER_ID = 1;

router.post("/coach/chat", async (req, res): Promise<void> => {
  const parsed = CoachChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, DEFAULT_USER_ID));
  const sessions = await db.select()
    .from(studySessionsTable)
    .where(eq(studySessionsTable.userId, DEFAULT_USER_ID))
    .orderBy(desc(studySessionsTable.createdAt))
    .limit(20);

  const now = new Date();
  const topicsWithRetention = sessions.map((s) => {
    const daysSince = (now.getTime() - s.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const retention = calculateRetention(daysSince, s.difficulty) * 100;
    return { topic: s.topic, retention: Math.round(retention), daysSince: Math.round(daysSince), difficulty: s.difficulty };
  });

  const focusSessions = await db.select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, DEFAULT_USER_ID))
    .orderBy(desc(focusSessionsTable.timestamp))
    .limit(5);

  const brainBreaks = await db.select()
    .from(brainBreaksTable)
    .where(eq(brainBreaksTable.userId, DEFAULT_USER_ID))
    .orderBy(desc(brainBreaksTable.timestamp))
    .limit(5);

  const pendingRevisions = await db.select({
    id: revisionScheduleTable.id,
    nextRevision: revisionScheduleTable.nextRevision,
    topic: studySessionsTable.topic,
  })
    .from(revisionScheduleTable)
    .innerJoin(studySessionsTable, eq(revisionScheduleTable.sessionId, studySessionsTable.id))
    .where(eq(revisionScheduleTable.completed, false))
    .orderBy(revisionScheduleTable.nextRevision)
    .limit(5);

  const systemPrompt = `You are Synapset Coach — an elite AI study coach with deep knowledge of cognitive science, memory, and learning optimization. You have access to the student's complete learning profile.

STUDENT PROFILE:
- Name: ${user?.name ?? "Student"}
- Level: ${user?.level ?? 1} | XP: ${user?.xp ?? 0} | Streak: ${user?.streak ?? 0} days

TOPICS & RETENTION (Ebbinghaus forgetting curve R = e^(-t/S)):
${topicsWithRetention.map((t) => `- ${t.topic}: ${t.retention}% retention (${t.daysSince} days ago, difficulty ${t.difficulty}/5)`).join("\n")}

UPCOMING REVISIONS:
${pendingRevisions.map((r) => `- ${r.topic}: due ${new Date(r.nextRevision).toLocaleDateString()}`).join("\n")}

RECENT FOCUS SESSIONS:
${focusSessions.map((f) => `- ${Math.round(f.duration / 60)} min session, focus score: ${f.focusConsistencyScore}/100`).join("\n")}

BRAIN BREAKS: ${brainBreaks.length} recent breaks (avg blink score: ${brainBreaks.length > 0 ? Math.round(brainBreaks.reduce((a, b) => a + b.blinkScore, 0) / brainBreaks.length) : "N/A"}/100)

You can:
1. Identify weakest topics and recommend urgent revision
2. Generate flashcard quiz questions for specific topics
3. Recommend study strategies (pomodoro, active recall, interleaving, spaced repetition)
4. Provide weekly performance summaries
5. Give motivational nudges based on streak data
6. Calculate exactly when topics will drop below 50% retention

Be specific, data-driven, and actionable. Reference actual retention percentages and days. Keep responses concise but impactful.`;

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: parsed.data.message }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  const reply = textBlock?.type === "text" ? textBlock.text : "I'm having trouble connecting. Please try again.";

  const suggestions = [];
  const weakTopics = topicsWithRetention.filter((t) => t.retention < 50).map((t) => t.topic);
  if (weakTopics.length > 0) suggestions.push(`Revise: ${weakTopics[0]}`);
  if (pendingRevisions.length > 0) suggestions.push(`Schedule: ${pendingRevisions[0].topic}`);
  suggestions.push("Start a 25-min focus session");

  res.json({ reply, suggestions: suggestions.slice(0, 3) });
});

export default router;
