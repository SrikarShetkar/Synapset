import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, airDrawingsTable } from "@workspace/db";
import { CreateAirDrawingBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_USER_ID = 1;

router.get("/air-drawings", async (req, res): Promise<void> => {
  const drawings = await db.select()
    .from(airDrawingsTable)
    .where(eq(airDrawingsTable.userId, DEFAULT_USER_ID))
    .orderBy(desc(airDrawingsTable.timestamp));

  res.json(drawings.map((d) => ({
    id: d.id,
    userId: d.userId,
    topicLinked: d.topicLinked,
    imageUrl: d.imageUrl ?? null,
    timestamp: d.timestamp.toISOString(),
  })));
});

router.post("/air-drawings", async (req, res): Promise<void> => {
  const parsed = CreateAirDrawingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [drawing] = await db.insert(airDrawingsTable).values({
    userId: DEFAULT_USER_ID,
    topicLinked: parsed.data.topicLinked,
    imageUrl: parsed.data.imageUrl ?? null,
  }).returning();

  res.status(201).json({
    id: drawing.id,
    userId: drawing.userId,
    topicLinked: drawing.topicLinked,
    imageUrl: drawing.imageUrl ?? null,
    timestamp: drawing.timestamp.toISOString(),
  });
});

export default router;
