import { relations } from "drizzle-orm";
import { webhookEvents } from "./webhookEvents";
import type { SessionStatus } from "./constants";
import { paymentAttempts } from "./paymentAttempts";
import {
  uuid,
  index,
  integer,
  pgTable,
  varchar,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().unique().defaultRandom(),
    amount: integer("amount").notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    customerEmail: varchar("customer_email", { length: 200 }),
    status: varchar("status", { length: 20 })
      .$type<SessionStatus>()
      .notNull()
      .default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("sessions_order_id_idx").on(table.orderId),
    index("sessions_status_idx").on(table.status),
    index("sessions_updated_at_idx").on(table.updatedAt),
  ],
);

export const sessionsRelations = relations(sessions, ({ many }) => ({
  paymentAttempts: many(paymentAttempts),
  webhookEvents: many(webhookEvents),
}));

export type SessionRecord = typeof sessions.$inferSelect;
export type NewSessionRecord = typeof sessions.$inferInsert;
