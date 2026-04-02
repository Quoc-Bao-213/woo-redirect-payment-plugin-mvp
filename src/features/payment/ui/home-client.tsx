"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { StatusBadge } from "@/features/payment/ui/status-badge";
import { StepTracker } from "@/features/payment/ui/step-tracker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardTitle,
  CardFooter,
  CardHeader,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  type SessionStatus,
  deriveFlowStageFromSession,
} from "@/features/payment/ui/flow-stage";

type LatestStatus = {
  sessionId: string;
  orderId: string;
  status: SessionStatus;
  attemptCount: number;
  maxAttempts: number;
  amount: number;
  currency: string;
  responseCode: string | null;
  responseMessage: string | null;
  transactionId: string | null;
  webhookDelivered: boolean;
  updatedAt: string;
};

type LatestStatusResponse = {
  latestStatus: LatestStatus | null;
};

type CreateSessionResponse = {
  sessionId: string;
  orderId: string;
  status: string;
  checkoutUrl: string;
  reused: boolean;
  supersededSessionId?: string;
};

const POLLING_MS = 5000;
const DEFAULT_AMOUNT = "4999";

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US");
}

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount / 100);
}

async function readErrorMessage(response: Response) {
  try {
    const parsed = (await response.json()) as {
      error?: { message?: string };
    };

    return parsed.error?.message ?? "Request failed";
  } catch {
    return "Request failed";
  }
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function parseMinorAmount(input: string) {
  const normalized = input.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);

  if (!Number.isInteger(value) || value <= 0 || value > 1_000_000) {
    return null;
  }

  return value;
}

export function HomeClient() {
  const [latestStatus, setLatestStatus] = useState<LatestStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState(DEFAULT_AMOUNT);

  const flowState = deriveFlowStageFromSession(
    latestStatus
      ? {
          status: latestStatus.status,
          attemptCount: latestStatus.attemptCount,
          webhookDelivered: latestStatus.webhookDelivered,
        }
      : null,
    "home",
  );

  const refreshLatestStatus = useCallback(async () => {
    try {
      setStatusError(null);

      const response = await fetch("/api/demo/latest-status", {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const parsed = (await response.json()) as LatestStatusResponse;
      setLatestStatus(parsed.latestStatus);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch latest status";
      setStatusError(message);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    void refreshLatestStatus();

    const interval = setInterval(() => {
      void refreshLatestStatus();
    }, POLLING_MS);

    return () => clearInterval(interval);
  }, [refreshLatestStatus]);

  async function handleCheckout() {
    setCreating(true);
    setCreateError(null);

    const parsedAmount = parseMinorAmount(amountInput);

    if (parsedAmount === null) {
      setCreateError(
        "Amount must be a positive integer in minor unit (1 - 1000000).",
      );
      setCreating(false);
      return;
    }

    try {
      const response = await fetch("/api/demo/session/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: parsedAmount,
          currency: "USD",
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const parsed = (await response.json()) as CreateSessionResponse;
      window.location.href = parsed.checkoutUrl;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create session";
      setCreateError(message);
      setCreating(false);
    }
  }

  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 md:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-60 bg-linear-to-b from-cyan-300/85 via-sky-200/45 to-transparent" />

      <Card className="border-teal-300/85 shadow-sm">
        <CardHeader>
          <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">
            WooCommerce Redirect Payment MVP
          </CardTitle>
          <CardDescription className="text-base leading-relaxed text-slate-700">
            Demo flow: homepage creates checkout session, user is redirected to
            hosted checkout, and webhook is the only source of truth for final
            payment state.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <StepTracker
            stage={flowState.stage}
            activeStep={flowState.activeStep}
            statusVariant={flowState.statusVariant}
          />

          <div className="grid gap-1.5 md:max-w-xs">
            <Label htmlFor="amount-minor">Amount (USD minor unit)</Label>
            <Input
              id="amount-minor"
              inputMode="numeric"
              value={amountInput}
              onChange={(event) =>
                setAmountInput(normalizeDigits(event.target.value))
              }
              placeholder="4999"
              disabled={creating}
            />
            <p className="text-sm text-muted-foreground">
              Enter integer cents. Example: 4999 = $49.99 (USD fixed).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleCheckout} disabled={creating}>
              {creating ? "Creating session..." : "Pay Now"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void refreshLatestStatus()}
            >
              Refresh Status
            </Button>
          </div>

          {createError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not create session</AlertTitle>
              <AlertDescription>{createError}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="justify-between text-sm text-muted-foreground">
          <span>
            Redirect result page is UX only, webhook remains the source of
            truth.
          </span>
        </CardFooter>
      </Card>

      <Card className="border-teal-300/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Payment Session Status
            {latestStatus ? <StatusBadge status={latestStatus.status} /> : null}
          </CardTitle>
          <CardDescription className="text-base leading-relaxed text-slate-700">
            Latest session state from backend database after webhook processing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStatus ? (
            <p className="text-base text-muted-foreground">Loading status...</p>
          ) : null}

          {statusError ? (
            <Alert variant="destructive">
              <AlertTitle>Status fetch failed</AlertTitle>
              <AlertDescription>{statusError}</AlertDescription>
            </Alert>
          ) : null}

          {!loadingStatus && !statusError && !latestStatus ? (
            <p className="text-base text-muted-foreground">
              No session yet. Click Pay Now to create one.
            </p>
          ) : null}

          {latestStatus ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-base md:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Session ID</dt>
                <dd className="font-mono">{latestStatus.sessionId}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Order ID</dt>
                <dd className="font-mono">{latestStatus.orderId}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Current status</dt>
                <dd className="mt-1">
                  <StatusBadge status={latestStatus.status} />
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Attempt count</dt>
                <dd>
                  {latestStatus.attemptCount} / {latestStatus.maxAttempts}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Amount</dt>
                <dd>
                  {formatAmount(latestStatus.amount, latestStatus.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Webhook delivered</dt>
                <dd>{latestStatus.webhookDelivered ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Response code</dt>
                <dd>{latestStatus.responseCode ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Transaction ID</dt>
                <dd className="font-mono">
                  {latestStatus.transactionId ?? "-"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Response message</dt>
                <dd>{latestStatus.responseMessage ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated at</dt>
                <dd>{formatDateTime(latestStatus.updatedAt)}</dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
