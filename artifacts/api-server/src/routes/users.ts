import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { GetMeResponse, UpdateMeBody } from "@workspace/api-zod";

const router: IRouter = Router();

const DEFAULT_USER_ID = 1;

router.get("/users/me", async (req, res): Promise<void> => {
  res.json({ id: 1, name: "Demo Student", email: "demo@synapset.ai", xp: 450, streak: 7, level: 3 });
  return;
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

  res.json(GetMeResponse.parse(user));
});

router.put("/users/me", async (req, res): Promise<void> => {
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [user] = await db.update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, DEFAULT_USER_ID))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetMeResponse.parse(user));
});

export default router;
