# WooCommerce Redirect Payment MVP (Next.js + Drizzle + PostgreSQL)

This project is a **demo MVP** for a WooCommerce-style redirect payment flow.

The goal is to demonstrate these core principles:

- User starts from homepage and enters amount.
- User is redirected to a hosted checkout page.
- Payment attempts are processed on backend.
- **Webhook is the only source of truth for final session state** (`succeeded`, `failed`, `cancelled`).
- Redirect/result pages are UX feedback only.

This is intentionally not production architecture. It is a focused flow demo.

## 1) Tech Stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- PostgreSQL
- Drizzle ORM + drizzle-kit
- Zod (request and payload validation)
- Tailwind CSS + shadcn/ui

## 2) High-Level Flow

1. Homepage (`/`) loads latest session status once and shows flow tracker.
2. User inputs amount in minor unit (USD cents) and clicks `Pay Now`.
3. Backend creates/reuses a pending session and redirects to `/checkout/[sessionId]`.
4. User submits card data on hosted checkout.
5. Backend always records `payment_attempts` and increments `attempt_count`.
6. Webhook behavior:
   - **Success**: dispatch webhook immediately -> final `succeeded`.
   - **Failed attempt 1/2**: no webhook dispatch, session stays `pending`, user retries on checkout.
   - **Failed attempt 3**: dispatch webhook -> final `failed`.
   - **Cancel**: dispatch webhook -> final `cancelled`.
7. Homepage and checkout summary reflect database state.

## 3) Business Rules Implemented

- Initial session status is `pending`.
- Session expiry is 25 minutes.
- Max retry is 3 attempts.
- Payment logic runs in backend simulation.
- Full card number is never stored in DB.
- Only masked card is stored in `payment_attempts`.
- Webhook endpoint validates HMAC signature.
- Session ID used across app is `sessions.id` (UUID).

## 4) Session Reuse / Supersede Logic

When homepage calls `POST /api/demo/session/create`:

- If there is an active pending session with same amount -> return existing session (`reused: true`).
- If there is an active pending session with different amount -> expire old session immediately and create new one (`supersededSessionId` returned).
- If no active pending session -> create new pending session.

This keeps one active pending session policy for MVP and avoids old payable pending sessions.

## 5) Project Structure

```txt
src/
  app/
    page.tsx
    checkout/[sessionId]/page.tsx
    result/success/[sessionId]/page.tsx
    result/failed/[sessionId]/page.tsx
    result/cancelled/[sessionId]/page.tsx
    api/
      demo/
        latest-status/route.ts
        session/create/route.ts
        session/[sessionId]/route.ts
        session/[sessionId]/pay/route.ts
        session/[sessionId]/cancel/route.ts
      webhook/payment/route.ts

  db/
    index.ts
    schema/
      constants.ts
      sessions.ts
      paymentAttempts.ts
      webhookEvents.ts
      index.ts

  features/payment/
    schemas.ts
    simulator.ts
    service.ts
    utils.ts
    ui/
      home-client.tsx
      checkout-client.tsx
      result-view.tsx
      step-tracker.tsx
      status-badge.tsx
      flow-stage.ts
```

## 6) Environment Variables

Create `.env.local` based on `.env.example`:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/woo_redirect_mvp
APP_BASE_URL=http://localhost:3000
WEBHOOK_SHARED_SECRET=replace-with-a-random-secret
```

Purpose:

- `DATABASE_URL`: PostgreSQL connection string used by Drizzle.
- `APP_BASE_URL`: base URL used by internal webhook dispatcher.
- `WEBHOOK_SHARED_SECRET`: HMAC secret for webhook signature generation/verification.

## 7) Local Setup

### Prerequisites

- Node.js 20+
- npm 10+
- PostgreSQL running locally

### Install and run

```bash
npm install
```

Create database (example):

```sql
CREATE DATABASE woo_redirect_mvp;
```

Push schema using drizzle-kit:

```bash
npx drizzle-kit push
```

Run app:

```bash
npm run dev
```

Open: `http://localhost:3000`

## 8) Database Schema (Purpose + Columns)

### `sessions`

Tracks payment session lifecycle.

- `id` (uuid, PK): canonical session ID used in URL/API.
- `order_id` (uuid, unique): demo order identifier.
- `amount` (int): minor unit amount (USD cents).
- `currency` (varchar(3)): currency code (default flow uses `USD`).
- `customer_email` (varchar(200), nullable): email from checkout submit.
- `status` (`pending|succeeded|failed|cancelled`): final state only set by webhook.
- `attempt_count` (int): number of pay attempts made.
- `max_attempts` (int): retry limit (3).
- `expires_at` (timestamptz): session expiry.
- `created_at`, `updated_at` (timestamptz).

Indexes:

- `sessions_order_id_idx`
- `sessions_status_idx`
- `sessions_updated_at_idx`

### `payment_attempts`

One row per click on `Pay Now`.

- `id` (uuid, PK)
- `session_id` (uuid FK -> sessions.id, cascade)
- `attempt_number` (int)
- `masked_card_number` (varchar(24))
- `status` (`succeeded|failed`)
- `response_code` (varchar(32))
- `response_message` (varchar(255))
- `transaction_id` (uuid, nullable)
- `created_at` (timestamptz)

Indexes:

- unique `(session_id, attempt_number)`
- `(session_id, created_at)`

### `webhook_events`

Stores webhook events and idempotency status.

- `id` (uuid, PK)
- `session_id` (uuid FK -> sessions.id, cascade)
- `event_id` (uuid, unique)
- `event_type` (`payment.succeeded|payment.failed|payment.cancelled`)
- `payload` (jsonb)
- `processed` (boolean)
- `created_at` (timestamptz)

Indexes:

- `webhook_event_id_idx`
- `(session_id, created_at)`
- `webhook_processed_idx`

## 9) API Reference (with Purpose)

## POST `/api/demo/session/create`

Purpose:

- Create a new pending session or reuse/supersede existing pending session.

Request body:

```json
{
  "amount": 4999,
  "currency": "USD"
}
```

Response 201:

```json
{
  "sessionId": "uuid",
  "orderId": "uuid",
  "status": "pending",
  "checkoutUrl": "http://localhost:3000/checkout/<sessionId>",
  "reused": false,
  "supersededSessionId": "uuid"
}
```

Notes:

- `supersededSessionId` exists only when old pending session is force-expired due to amount change.

## GET `/api/demo/session/[sessionId]`

Purpose:

- Fetch session detail for checkout/result/status rendering.

Success response 200:

```json
{
  "sessionId": "uuid",
  "orderId": "uuid",
  "amount": 4999,
  "currency": "USD",
  "status": "pending",
  "attemptCount": 1,
  "maxAttempts": 3,
  "expiresAt": "2026-04-02T05:00:00.000Z",
  "customerEmail": "demo@example.com",
  "updatedAt": "2026-04-02T04:40:00.000Z",
  "webhookDelivered": false,
  "latestAttempt": {
    "attemptNumber": 1,
    "maskedCardNumber": "************4242",
    "status": "failed",
    "responseCode": "05",
    "responseMessage": "Payment failed. Please retry.",
    "transactionId": null,
    "createdAt": "2026-04-02T04:40:00.000Z"
  }
}
```

Error responses:

- `404 SESSION_NOT_FOUND`
- `410 SESSION_EXPIRED`

## POST `/api/demo/session/[sessionId]/pay`

Purpose:

- Submit hosted checkout payment attempt.
- Creates `payment_attempts` record every call.
- Dispatches webhook only on terminal conditions.

Request body:

```json
{
  "email": "user@example.com",
  "cardHolderName": "Demo User",
  "cardNumber": "4242 4242 4242 4242",
  "expiry": "01/30",
  "cvv": "123"
}
```

Response behavior:

- Fail attempt 1 or 2:

```json
{
  "redirectTo": "/checkout",
  "message": "Payment attempt failed. Please retry. Final status is not updated until terminal webhook."
}
```

- Success:

```json
{
  "redirectTo": "/result/success",
  "message": "Payment submitted. Final state will be updated by webhook."
}
```

- Fail attempt 3:

```json
{
  "redirectTo": "/result/failed",
  "message": "Payment submitted. Final state will be updated by webhook."
}
```

Errors include: `SESSION_NOT_FOUND`, `SESSION_EXPIRED`, `SESSION_NOT_PAYABLE`, validation errors.

## POST `/api/demo/session/[sessionId]/cancel`

Purpose:

- User cancellation from hosted checkout.
- Emits webhook `payment.cancelled` to finalize session state.

Request body:

```json
{
  "reason": "User cancelled on hosted checkout"
}
```

Response:

```json
{
  "redirectTo": "/result/cancelled",
  "message": "Cancellation submitted. Final state will be updated by webhook."
}
```

## GET `/api/demo/latest-status`

Purpose:

- Return latest session summary for homepage status panel.

Response:

```json
{
  "latestStatus": {
    "sessionId": "uuid",
    "orderId": "uuid",
    "status": "pending",
    "attemptCount": 0,
    "maxAttempts": 3,
    "amount": 4999,
    "currency": "USD",
    "responseCode": null,
    "responseMessage": null,
    "transactionId": null,
    "webhookDelivered": false,
    "updatedAt": "2026-04-02T04:30:00.000Z"
  }
}
```

## POST `/api/webhook/payment`

Purpose:

- Internal webhook receiver.
- Validates HMAC signature and payload schema.
- Applies final session state update.

Headers:

- `x-webhook-signature: <sha256-hmac-hex>`

Payload shape:

```json
{
  "eventId": "uuid",
  "eventType": "payment.succeeded",
  "sessionId": "uuid",
  "orderId": "uuid",
  "status": "succeeded",
  "attemptNumber": 1,
  "transactionId": "uuid",
  "responseCode": "00",
  "responseMessage": "Approved",
  "occurredAt": "2026-04-02T04:35:00.000Z"
}
```

Webhook processing notes:

- Rejects invalid signature (`401 INVALID_SIGNATURE`).
- Rejects event/status mismatch (`400 WEBHOOK_STATUS_MISMATCH`).
- Uses `event_id` for idempotency.
- Marks `webhook_events.processed = true` after update.

## 10) Card Simulation Rules

Current simulator (`src/features/payment/simulator.ts`):

- `4242 4242 4242 4242` -> success
- Any other 16-digit card -> failed generic

Generic failure uses:

- `responseCode = "05"`
- `responseMessage = "Payment failed. Please retry."`

## 11) UI Behavior

### Homepage (`/`)

- Contains amount input (USD minor unit).
- Calls create session and redirects to checkout.
- Shows latest status snapshot (single fetch on mount, no polling).

### Checkout (`/checkout/[sessionId]`)

- Shows session summary and payment form.
- On non-terminal failure (retry 1/2), stays on checkout and reloads session.
- Displays inline action error for failed retry.
- Locks payment actions if session is terminal (`succeeded`, `cancelled`, or `failed` with exhausted retries).

### Result pages (`/result/.../[sessionId]`)

- UX feedback pages for success/failed/cancelled.
- Current implementation fetches session once on mount (no polling).

## 12) Manual Test Scenarios

1. **Create new session**
   - Enter amount `4999`, click `Pay Now`.
   - Verify redirect to checkout and status `pending`.

2. **Reuse pending session**
   - Go back home, keep same amount, click `Pay Now`.
   - Verify session is reused.

3. **Supersede pending session**
   - Go back home, change amount, click `Pay Now`.
   - Verify old pending session expires and new session is created.

4. **Retry fail 1/2**
   - Use any non-success card.
   - Verify stays on checkout, attempt increases, no final state webhook update.

5. **Terminal fail attempt 3**
   - Fail three times.
   - Verify redirect to failed result and final status becomes `failed` via webhook.

6. **Success path**
   - Use `4242 4242 4242 4242`.
   - Verify redirect to success and final `succeeded` via webhook.

7. **Cancel path**
   - Click cancel.
   - Verify final `cancelled` via webhook.

8. **Expired session**
   - Open expired checkout URL.
   - Verify `SESSION_EXPIRED` behavior and blocked payment actions.

## 13) Common Error Codes

- `VALIDATION_ERROR`
- `INTERNAL_SERVER_ERROR`
- `SESSION_NOT_FOUND`
- `SESSION_EXPIRED`
- `SESSION_NOT_PAYABLE`
- `SESSION_ALREADY_PAID`
- `SESSION_ATTEMPTS_EXHAUSTED`
- `INVALID_SIGNATURE`
- `WEBHOOK_STATUS_MISMATCH`
- `WEBHOOK_DELIVERY_FAILED`

## 14) MVP Limitations

This demo intentionally omits production concerns such as:

- Authentication and per-user session ownership
- Queue/retry infrastructure for webhooks
- Real payment provider integration
- Multi-merchant routing and tenant isolation
- Full audit logging/monitoring/alerting
- PCI-compliant card data processing pipeline

It is focused on demonstrating redirect + webhook truth model in a compact codebase.

## 15) V2 SDK Mode (Feature Flag)

This project now supports two checkout UI modes on the same route (`/checkout/[sessionId]`):

- `PAYMENT_UI_MODE=native` -> existing native card form (V1)
- `PAYMENT_UI_MODE=sdk` -> LuqraToken SDK embedded fields (V2)

Additional env vars for SDK mode:

```env
PAYMENT_UI_MODE=sdk
NEXT_PUBLIC_AUXVAULT_API_KEY=<public-sdk-key>
NEXT_PUBLIC_AUXVAULT_ENDPOINT=https://sandbox-api.auxvault.net/api/v1/public/transaction

# Recommended: self-host SDK assets in this repo (public/auxvault-sdk)
NEXT_PUBLIC_AUXVAULT_BASE_URL=/auxvault-sdk
NEXT_PUBLIC_AUXVAULT_SCRIPT_SRC=/auxvault-sdk/auxVault.js
NEXT_PUBLIC_AUXVAULT_VAULT_FILE=/auxvault-sdk/auxvault-field.html
NEXT_PUBLIC_AUXVAULT_VAULT_CARD_FILE=/auxvault-sdk/auxvault-card-unified.html

# Optional fallback to remote provider CDN
# NEXT_PUBLIC_AUXVAULT_SCRIPT_SRC=https://luqratoken.com/sdk/auxVault.js
# NEXT_PUBLIC_AUXVAULT_VAULT_FILE=https://luqratoken.com/sdk/auxvault-field.html
```

### New API (V2)

## POST `/api/demo/session/[sessionId]/sdk-result`

Purpose:

- Ingest SDK transaction result from browser.
- Keep same retry/webhook truth behavior as V1 backend logic.

Behavior:

- Always increments `attempt_count` and inserts `payment_attempts` row.
- Success -> dispatch internal webhook `payment.succeeded`.
- Failed attempt 1/2 -> no webhook, stay pending, redirect `/checkout`.
- Failed attempt 3 -> dispatch internal webhook `payment.failed`.

Accepted payload fields (normalized):

```json
{
  "status": "succeeded",
  "success": true,
  "approved": true,
  "responseCode": "00",
  "responseMessage": "Approved",
  "transactionId": "optional-provider-id",
  "maskedCardNumber": "************1111",
  "email": "customer@example.com",
  "raw": {}
}
```

Notes:

- If provider transaction id is not UUID, it is not stored in `transaction_id` (set to `null`) to match current DB type.
- If masked PAN is missing, backend stores fallback `sdk-tokenized`.
- Final state still comes from webhook processing, not direct UI response.



