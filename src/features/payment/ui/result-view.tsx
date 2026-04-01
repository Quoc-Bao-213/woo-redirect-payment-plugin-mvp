"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/features/payment/ui/status-badge";
import { StepTracker } from "@/features/payment/ui/step-tracker";
import {
  Card,
  CardTitle,
  CardHeader,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import {
  type SessionStatus,
  deriveFlowStageFromSession,
} from "@/features/payment/ui/flow-stage";

type ResultSession = {
  sessionId: string;
  status: SessionStatus;
  attemptCount: number;
  webhookDelivered: boolean;
  updatedAt: string;
};

export function ResultView({
  title,
  description,
  sessionId,
  expectedStatus,
}: {
  title: string;
  description: string;
  sessionId?: string;
  expectedStatus?: SessionStatus;
}) {
  const [session, setSession] = useState<ResultSession | null>(null);
  const [loading, setLoading] = useState(Boolean(sessionId));

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let active = true;

    const refreshSession = async () => {
      try {
        const response = await fetch(`/api/demo/session/${sessionId}`, {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const parsed = (await response.json()) as {
          sessionId: string;
          status: SessionStatus;
          attemptCount: number;
          webhookDelivered: boolean;
          updatedAt: string;
        };

        if (!active) {
          return;
        }

        setSession(parsed);
        setLoading(false);
      } catch {
        if (active) {
          setLoading(false);
        }
      }
    };

    void refreshSession();

    const interval = setInterval(() => {
      if (!active) {
        return;
      }

      void refreshSession();
    }, 2500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  const flowState = useMemo(() => {
    if (session) {
      return deriveFlowStageFromSession(
        {
          status: session.status,
          attemptCount: session.attemptCount,
          webhookDelivered: session.webhookDelivered,
        },
        "result",
      );
    }

    if (sessionId) {
      return {
        stage: "webhook_processing" as const,
        activeStep: 4,
        statusVariant: "processing" as const,
      };
    }

    return deriveFlowStageFromSession(null, "result");
  }, [session, sessionId]);

  const displayedStatus = session?.status ?? expectedStatus;

  return (
    <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 md:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-52 bg-linear-to-b from-cyan-300/85 via-sky-200/45 to-transparent" />

      <StepTracker
        stage={flowState.stage}
        activeStep={flowState.activeStep}
        statusVariant={flowState.statusVariant}
      />

      <Card className="border-teal-300/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
            {title}
            {displayedStatus ? <StatusBadge status={displayedStatus} /> : null}
          </CardTitle>
          <CardDescription className="text-base leading-relaxed text-slate-700">
            {description}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-base">
          <p>
            Redirect result page is only UX feedback. Final status is updated by
            webhook.
          </p>

          {sessionId ? <p className="font-mono">Session: {sessionId}</p> : null}

          {sessionId ? (
            <p className="text-muted-foreground">
              {loading
                ? "Loading latest session state..."
                : session?.webhookDelivered
                  ? `Webhook delivered at ${new Date(session.updatedAt).toLocaleString("en-US")}`
                  : "Waiting for webhook confirmation..."}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button asChild>
              <Link href="/">Back to Homepage</Link>
            </Button>
            {sessionId ? (
              <Button variant="outline" asChild>
                <Link href={`/checkout/${sessionId}`}>
                  Open Checkout Session
                </Link>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
