import { pgTable, serial, integer, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const brainBreaksTable = pgTable("brain_breaks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  blinkScore: real("blink_score").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBrainBreakSchema = createInsertSchema(brainBreaksTable).omit({ id: true, timestamp: true });
export type InsertBrainBreak = z.infer<typeof insertBrainBreakSchema>;
export type BrainBreak = typeof brainBreaksTable.$inferSelect;
