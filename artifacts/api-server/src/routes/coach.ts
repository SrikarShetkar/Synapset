import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, studySessionsTable, revisionScheduleTable, focusSessionsTable, brainBreaksTable, usersTable } from "@workspace/db";
import { CoachChatBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { calculateRetention } from "../lib/retention";
import { mockState } from "./mock-db";

const router: IRouter = Router();

const DEFAULT_USER_ID = 1;

router.post("/coach/chat", async (req, res): Promise<void> => {
  const parsed = CoachChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = mockState.user;
  const sessions = mockState.studySessions.slice(0, 20);

  const now = new Date();
  const topicsWithRetention = sessions.map((s) => {
    const daysSince = (now.getTime() - new Date(s.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    const retention = calculateRetention(daysSince, s.difficulty) * 100;
    return { topic: s.topic, retention: Math.round(retention), daysSince: Math.round(daysSince), difficulty: s.difficulty };
  });

  const pendingRevisions = mockState.subjectCards.filter(c => c.isUrgent);

  const weakTopics = topicsWithRetention.filter((t) => t.retention < 50).map((t) => t.topic);

  const userMessage = parsed.data.message.toLowerCase();
  let reply = "";

  if (userMessage.includes("hello") || userMessage.includes("hi")) {
    reply = `Hello ${user.name}! I see you've logged ${sessions.length} sessions and have a ${user.streak}-day streak. How can I help you study today?`;
  } else if (userMessage.includes("quiz") || userMessage.includes("test")) {
    const weakTopic = weakTopics.length > 0 ? weakTopics[0] : (sessions[0]?.topic || "your subjects");
    reply = `Alright! Let's do a quick quiz on **${weakTopic}**. Question 1: Can you explain the core concept in your own words?`;
  } else if (userMessage.includes("schedule") || userMessage.includes("plan")) {
    reply = `Based on your retention curves, you have ${pendingRevisions.length} subjects that are urgent. I recommend spending 25 minutes reviewing them right now using the Pomodoro technique.`;
  } else if (userMessage.includes("help") || userMessage.includes("stuck")) {
    reply = `Don't worry, learning takes time! I recommend taking a quick 5-minute brain break. Physical movement can help reset your cognitive load. Let me know when you're ready to jump back in.`;
  } else {
    reply = `I see! "${parsed.data.message}" is an interesting point. Based on your current brain map (${sessions.length} active topics), we have some excellent neural pathways developing. What specific subject should we optimize next?`;
  }

  const suggestions = [];
  if (weakTopics.length > 0) suggestions.push(`Revise: ${weakTopics[0]}`);
  if (pendingRevisions.length > 0) suggestions.push(`Schedule: ${pendingRevisions[0].topic}`);
  suggestions.push("Start a 25-min focus session");

  res.json({ reply, suggestions: suggestions.slice(0, 3) });
});

export default router;
