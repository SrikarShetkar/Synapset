import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, brainBreaksTable } from "@workspace/db";
import { CreateBrainBreakBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_USER_ID = 1;

router.get("/brain-breaks", async (req, res): Promise<void> => {
  const breaks = await db.select()
    .from(brainBreaksTable)
    .where(eq(brainBreaksTable.userId, DEFAULT_USER_ID))
    .orderBy(desc(brainBreaksTable.timestamp));

  res.json(breaks.map((b) => ({
    id: b.id,
    userId: b.userId,
    blinkScore: b.blinkScore,
    timestamp: b.timestamp.toISOString(),
  })));
});

router.post("/brain-breaks", async (req, res): Promise<void> => {
  const parsed = CreateBrainBreakBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [brk] = await db.insert(brainBreaksTable).values({
    userId: DEFAULT_USER_ID,
    blinkScore: parsed.data.blinkScore,
  }).returning();

  res.status(201).json({
    id: brk.id,
    userId: brk.userId,
    blinkScore: brk.blinkScore,
    timestamp: brk.timestamp.toISOString(),
  });
});

export default router;
