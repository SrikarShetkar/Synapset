import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, focusSessionsTable } from "@workspace/db";
import { CreateFocusSessionBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_USER_ID = 1;

router.get("/focus-sessions", async (req, res): Promise<void> => {
  const sessions = await db.select()
    .from(focusSessionsTable)
    .where(eq(focusSessionsTable.userId, DEFAULT_USER_ID))
    .orderBy(desc(focusSessionsTable.timestamp));

  res.json(sessions.map((s) => ({
    id: s.id,
    userId: s.userId,
    duration: s.duration,
    focusConsistencyScore: s.focusConsistencyScore,
    timestamp: s.timestamp.toISOString(),
  })));
});

router.post("/focus-sessions", async (req, res): Promise<void> => {
  const parsed = CreateFocusSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.insert(focusSessionsTable).values({
    userId: DEFAULT_USER_ID,
    duration: parsed.data.duration,
    focusConsistencyScore: parsed.data.focusConsistencyScore,
  }).returning();

  res.status(201).json({
    id: session.id,
    userId: session.userId,
    duration: session.duration,
    focusConsistencyScore: session.focusConsistencyScore,
    timestamp: session.timestamp.toISOString(),
  });
});

export default router;
