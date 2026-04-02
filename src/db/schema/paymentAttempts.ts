import { sessions } from "./sessions";
import { relations } from "drizzle-orm";
import type { AttemptStatus } from "./constants";
import {
  uuid,
  index,
  integer,
  varchar,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    maskedCardNumber: varchar("masked_card_number", { length: 24 }).notNull(),
    status: varchar("status", { length: 20 }).$type<AttemptStatus>().notNull(),
    responseCode: varchar("response_code", { length: 32 }).notNull(),
    responseMessage: varchar("response_message", { length: 255 }).notNull(),
    transactionId: uuid("transaction_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("attempts_session_attempt_unique_idx").on(
      table.sessionId,
      table.attemptNumber,
    ),
    index("attempts_session_created_at_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);

export const paymentAttemptsRelations = relations(
  paymentAttempts,
  ({ one }) => ({
    session: one(sessions, {
      fields: [paymentAttempts.sessionId],
      references: [sessions.id],
    }),
  }),
);

export type PaymentAttemptRecord = typeof paymentAttempts.$inferSelect;
