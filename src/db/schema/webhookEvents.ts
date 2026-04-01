import { sessions } from "./sessions";
import { relations } from "drizzle-orm";
import type { WebhookEventType } from "./constants";
import {
  uuid,
  index,
  jsonb,
  varchar,
  boolean,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.sessionId, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().unique().defaultRandom(),
    eventType: varchar("event_type", { length: 40 })
      .$type<WebhookEventType>()
      .notNull(),
    payload: jsonb("payload").notNull(),
    processed: boolean("processed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("webhook_event_id_idx").on(table.eventId),
    index("webhook_session_created_at_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    index("webhook_processed_idx").on(table.processed),
  ],
);

export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
  session: one(sessions, {
    fields: [webhookEvents.sessionId],
    references: [sessions.sessionId],
  }),
}));

export type WebhookEventRecord = typeof webhookEvents.$inferSelect;
