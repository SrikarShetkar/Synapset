import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const airDrawingsTable = pgTable("air_drawings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  topicLinked: text("topic_linked").notNull(),
  imageUrl: text("image_url"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAirDrawingSchema = createInsertSchema(airDrawingsTable).omit({ id: true, timestamp: true });
export type InsertAirDrawing = z.infer<typeof insertAirDrawingSchema>;
export type AirDrawing = typeof airDrawingsTable.$inferSelect;
