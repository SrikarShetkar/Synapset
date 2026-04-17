import { pgTable, serial, integer, timestamp, boolean, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { studySessionsTable } from "./study-sessions";

export const revisionScheduleTable = pgTable("revision_schedule", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => studySessionsTable.id),
  nextRevision: timestamp("next_revision", { withTimezone: true }).notNull(),
  completed: boolean("completed").notNull().default(false),
  retentionScore: real("retention_score").notNull().default(1.0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRevisionSchema = createInsertSchema(revisionScheduleTable).omit({ id: true, createdAt: true });
export type InsertRevision = z.infer<typeof insertRevisionSchema>;
export type Revision = typeof revisionScheduleTable.$inferSelect;
