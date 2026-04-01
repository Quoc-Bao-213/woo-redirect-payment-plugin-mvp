"use client";

import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardTitle,
  CardFooter,
  CardHeader,
  CardContent,
  CardDescription,
} from "@/components/ui/card";

type LatestStatus = {
  sessionId: string;
  orderId: string;
  status: "pending" | "succeeded" | "failed" | "cancelled";
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
};

const POLLING_MS = 4000;

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

export function HomeClient() {
  const [latestStatus, setLatestStatus] = useState<LatestStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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

    try {
      const response = await fetch("/api/demo/session/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          amount: 4999,
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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">
            WooCommerce Redirect Payment MVP
          </CardTitle>
          <CardDescription>
            Demo flow: homepage creates checkout session, user is redirected to
            hosted checkout, and webhook is the only source of truth for final
            payment state.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
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
        <CardFooter className="justify-between text-xs text-muted-foreground">
          <span>
            Redirect result page is UX only, not status source of truth.
          </span>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Session Status</CardTitle>
          <CardDescription>
            Latest session state from backend database after webhook processing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingStatus ? (
            <p className="text-sm text-muted-foreground">Loading status...</p>
          ) : null}

          {statusError ? (
            <Alert variant="destructive">
              <AlertTitle>Status fetch failed</AlertTitle>
              <AlertDescription>{statusError}</AlertDescription>
            </Alert>
          ) : null}

          {!loadingStatus && !statusError && !latestStatus ? (
            <p className="text-sm text-muted-foreground">
              No session yet. Click Checkout to create one.
            </p>
          ) : null}

          {latestStatus ? (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
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
                <dd className="font-medium uppercase">{latestStatus.status}</dd>
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
