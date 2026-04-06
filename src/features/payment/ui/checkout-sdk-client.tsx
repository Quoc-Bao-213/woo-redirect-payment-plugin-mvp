"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/features/payment/ui/status-badge";
import { type SessionStatus } from "@/features/payment/ui/flow-stage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardTitle,
  CardHeader,
  CardContent,
  CardDescription,
} from "@/components/ui/card";

type SessionDetail = {
  sessionId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: SessionStatus;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: string;
  customerEmail: string | null;
  updatedAt: string;
  webhookDelivered: boolean;
  latestAttempt: {
    attemptNumber: number;
    maskedCardNumber: string;
    status: "succeeded" | "failed";
    responseCode: string;
    responseMessage: string;
    transactionId: string | null;
    createdAt: string;
  } | null;
};

type ActionResponse = {
  redirectTo:
    | "/checkout"
    | "/result/success"
    | "/result/failed"
    | "/result/cancelled";
  message: string;
};

type CheckoutFetchErrorCode =
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "UNKNOWN";

type ParsedSdkResult = {
  status: "succeeded" | "failed";
  responseCode?: string | null;
  responseMessage?: string | null;
  transactionId?: string | null;
  maskedCardNumber?: string | null;
  raw?: unknown;
};

const sdkTestCards = [
  "VISA - 4111 1111 1111 1111 • Exp: 12/28 • CVV: 123",
  "AMEX - 3782 8224631 0005 • Exp: 12/28 • CVV: 0000",
] as const;

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

function asString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function pickString(
  source: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = asString(source[key]);

    if (value && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function parseSdkObject(raw: unknown): ParsedSdkResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const statusText = pickString(source, [
    "status",
    "result",
    "transactionStatus",
    "transaction_status",
  ])?.toLowerCase();
  const success = asBoolean(source.success);
  const approved = asBoolean(source.approved);
  const responseCode = pickString(source, [
    "responseCode",
    "response_code",
    "code",
  ]);

  let status: "succeeded" | "failed" | null = null;

  if (
    statusText &&
    ["succeeded", "success", "approved", "paid", "ok"].some((token) =>
      statusText.includes(token),
    )
  ) {
    status = "succeeded";
  } else if (
    statusText &&
    ["failed", "declined", "decline", "error", "rejected"].some((token) =>
      statusText.includes(token),
    )
  ) {
    status = "failed";
  } else if (success === true || approved === true || responseCode === "00") {
    status = "succeeded";
  } else if (success === false || approved === false) {
    status = "failed";
  }

  if (!status) {
    return null;
  }

  const rawMaskedCard = pickString(source, [
    "maskedCardNumber",
    "masked_card_number",
    "maskedPan",
    "masked_pan",
    "cardMasked",
  ]);

  const last4 = pickString(source, ["last4", "cardLast4", "card_last4"]);
  const maskedCardNumber =
    rawMaskedCard ?? (last4 ? `************${last4}` : null);

  return {
    status,
    responseCode,
    responseMessage: pickString(source, [
      "responseMessage",
      "response_message",
      "message",
      "description",
    ]),
    transactionId: pickString(source, [
      "transactionId",
      "transaction_id",
      "transId",
      "txnId",
    ]),
    maskedCardNumber,
    raw,
  };
}

function parseSdkResultText(text: string): ParsedSdkResult | null {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const fromObject = parseSdkObject(parsed);

    if (fromObject) {
      return fromObject;
    }
  } catch {
    // Fall through.
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");

  if (start !== -1 && end > start) {
    const candidate = trimmed.slice(start, end + 1);

    try {
      const parsed = JSON.parse(candidate) as unknown;
      const fromObject = parseSdkObject(parsed);

      if (fromObject) {
        return fromObject;
      }
    } catch {
      // Continue fallback.
    }
  }

  const lower = trimmed.toLowerCase();

  if (
    ["approved", "succeeded", "success", "paid"].some((token) =>
      lower.includes(token),
    )
  ) {
    return {
      status: "succeeded",
      responseMessage: trimmed,
      raw: trimmed,
    };
  }

  if (
    ["failed", "declined", "error", "invalid", "rejected"].some((token) =>
      lower.includes(token),
    )
  ) {
    return {
      status: "failed",
      responseMessage: trimmed,
      raw: trimmed,
    };
  }

  return null;
}

function fingerprintResult(result: ParsedSdkResult) {
  return JSON.stringify({
    status: result.status,
    responseCode: result.responseCode ?? null,
    responseMessage: result.responseMessage ?? null,
    transactionId: result.transactionId ?? null,
    maskedCardNumber: result.maskedCardNumber ?? null,
  });
}

export function CheckoutSdkClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const resultRef = useRef<HTMLDivElement | null>(null);
  const sdkPayButtonRef = useRef<HTMLButtonElement | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchErrorCode, setFetchErrorCode] =
    useState<CheckoutFetchErrorCode | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [email, setEmail] = useState("");
  const [sdkScriptLoaded, setSdkScriptLoaded] = useState(false);
  const [sdkInitError, setSdkInitError] = useState<string | null>(null);
  const [sdkResultText, setSdkResultText] = useState("");
  const [lastProcessedFingerprint, setLastProcessedFingerprint] = useState("");

  const sdkApiKey = process.env.NEXT_PUBLIC_AUXVAULT_API_KEY ?? "";
  const sdkEndpoint = process.env.NEXT_PUBLIC_AUXVAULT_ENDPOINT ?? "";
  const sdkBaseUrl = (
    process.env.NEXT_PUBLIC_AUXVAULT_BASE_URL ?? "/auxvault-sdk"
  ).replace(/\/$/, "");
  const sdkVaultFile =
    process.env.NEXT_PUBLIC_AUXVAULT_VAULT_FILE ??
    `${sdkBaseUrl}/auxvault-field.html`;
  const sdkVaultCardFile =
    process.env.NEXT_PUBLIC_AUXVAULT_VAULT_CARD_FILE ??
    `${sdkBaseUrl}/auxvault-card-unified.html`;
  const sdkScriptSrc =
    process.env.NEXT_PUBLIC_AUXVAULT_SCRIPT_SRC ?? `${sdkBaseUrl}/auxVault.js`;
  const isSdkConfigMissing = !sdkApiKey || !sdkEndpoint;

  const remainingAttempts = useMemo(() => {
    if (!session) {
      return 0;
    }

    return Math.max(session.maxAttempts - session.attemptCount, 0);
  }, [session]);

  const isRetryExhausted =
    session?.status === "failed" && session.attemptCount >= session.maxAttempts;
  const isPaymentLockedSession =
    session?.status === "succeeded" ||
    session?.status === "cancelled" ||
    Boolean(isRetryExhausted);

  const loadSession = useCallback(async () => {
    try {
      setFetchError(null);
      setFetchErrorCode(null);
      const response = await fetch(`/api/demo/session/${sessionId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        const parsed = (await response.json().catch(() => null)) as {
          error?: { code?: string; message?: string };
        } | null;
        const code = parsed?.error?.code;
        const message =
          parsed?.error?.message ?? "Failed to load checkout session";

        if (code === "SESSION_NOT_FOUND" || response.status === 404) {
          setFetchErrorCode("SESSION_NOT_FOUND");
        } else if (code === "SESSION_EXPIRED" || response.status === 410) {
          setFetchErrorCode("SESSION_EXPIRED");
        } else {
          setFetchErrorCode("UNKNOWN");
        }

        setFetchError(message);
        setSession(null);
        return;
      }

      const parsed = (await response.json()) as SessionDetail;
      setSession(parsed);
      setEmail(parsed.customerEmail ?? "");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load checkout session";
      setFetchErrorCode("UNKNOWN");
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    if (isSdkConfigMissing || !session) {
      return;
    }

    const scriptId = `auxvault-sdk-${sessionId}`;
    const existing = document.getElementById(
      scriptId,
    ) as HTMLScriptElement | null;

    if (existing) {
      setSdkScriptLoaded(true);
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = sdkScriptSrc;
    script.async = true;
    script.setAttribute("data-auto-init", "true");
    script.setAttribute("data-api-key", sdkApiKey);
    script.setAttribute("data-endpoint", sdkEndpoint);
    script.setAttribute("data-vault-file", sdkVaultFile);
    script.setAttribute("data-vault-card-file", sdkVaultCardFile);
    script.setAttribute(
      "data-default-amount",
      ((session.amount ?? 0) / 100).toFixed(2),
    );

    const onLoad = () => {
      setSdkScriptLoaded(true);
      setSdkInitError(null);
    };

    const onError = () => {
      setSdkInitError("Failed to load LuqraToken SDK script");
    };

    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);

    document.body.appendChild(script);

    return () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      script.remove();
    };
  }, [
    isSdkConfigMissing,
    sdkApiKey,
    sdkEndpoint,
    sdkScriptSrc,
    sdkVaultFile,
    sdkVaultCardFile,
    session,
    sessionId,
  ]);

  useEffect(() => {
    if (!sdkScriptLoaded || isSdkConfigMissing || isPaymentLockedSession) {
      return;
    }

    const timer = window.setTimeout(() => {
      const cardField = document.querySelector('[data-auxvault="cardNumber"]');
      const hasIframe = Boolean(cardField?.querySelector("iframe"));

      if (!hasIframe) {
        setSdkInitError(
          "SDK loaded but secure iframe fields were blocked. Check vault-file URL or provider frame-ancestors policy.",
        );
      }
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isPaymentLockedSession, isSdkConfigMissing, sdkScriptLoaded]);

  useEffect(() => {
    if (!resultRef.current) {
      return;
    }

    const node = resultRef.current;

    const readResult = () => {
      const next = node.textContent?.trim() ?? "";
      setSdkResultText(next);
    };

    const observer = new MutationObserver(readResult);
    observer.observe(node, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    readResult();

    return () => {
      observer.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    if (
      !sdkScriptLoaded ||
      !session ||
      isPaymentLockedSession ||
      !resultRef.current
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const next = resultRef.current?.textContent?.trim() ?? "";
      setSdkResultText((previous) => (previous === next ? previous : next));
    }, 400);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isPaymentLockedSession, sdkScriptLoaded, session, sessionId]);

  useEffect(() => {
    if (!session || isPaymentLockedSession || processing || cancelling) {
      return;
    }

    const parsed = parseSdkResultText(sdkResultText);

    if (!parsed) {
      return;
    }

    const fingerprint = fingerprintResult(parsed);

    if (fingerprint === lastProcessedFingerprint) {
      return;
    }

    const submit = async () => {
      setProcessing(true);
      setActionError(null);
      setLastProcessedFingerprint(fingerprint);

      try {
        const response = await fetch(
          `/api/demo/session/${sessionId}/sdk-result`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
            body: JSON.stringify({
              ...parsed,
              email: email || undefined,
              raw: parsed.raw ?? sdkResultText,
            }),
          },
        );

        if (!response.ok) {
          throw new Error(await readErrorMessage(response));
        }

        const action = (await response.json()) as ActionResponse;

        if (action.redirectTo === "/checkout") {
          setActionError("Invalid Credit Card Number");
          setProcessing(false);
          await loadSession();
          return;
        }

        router.push(`${action.redirectTo}/${sessionId}`);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Unable to process SDK payment";
        setActionError(message);
        setProcessing(false);
        await loadSession();
      }
    };

    void submit();
  }, [
    cancelling,
    email,
    isPaymentLockedSession,
    lastProcessedFingerprint,
    loadSession,
    processing,
    router,
    sdkResultText,
    session,
    sessionId,
  ]);

  useEffect(() => {
    const payButton = sdkPayButtonRef.current;

    if (!payButton || isPaymentLockedSession) {
      return;
    }

    const resetBeforeSdkPay = () => {
      setActionError(null);
      setLastProcessedFingerprint("");
      setSdkResultText("");

      if (resultRef.current) {
        resultRef.current.textContent = "";
      }
    };

    // Use native listener so we do not override SDK's own `onclick` binding.
    payButton.addEventListener("click", resetBeforeSdkPay, true);

    return () => {
      payButton.removeEventListener("click", resetBeforeSdkPay, true);
    };
  }, [actionError, isPaymentLockedSession, sdkScriptLoaded, sessionId]);
  async function handleCancel() {
    setActionError(null);
    setCancelling(true);

    if (isPaymentLockedSession) {
      setCancelling(false);
      return;
    }

    try {
      const response = await fetch(`/api/demo/session/${sessionId}/cancel`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "User cancelled on hosted checkout" }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const parsed = (await response.json()) as ActionResponse;
      router.push(`${parsed.redirectTo}/${sessionId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to cancel";
      setActionError(message);
      setCancelling(false);
      await loadSession();
    }
  }

  if (loading) {
    return (
      <p className="mx-auto w-full max-w-3xl p-6 text-base text-muted-foreground">
        Loading checkout session...
      </p>
    );
  }

  if (!session) {
    const notFoundMessage =
      fetchError ??
      "Checkout session was not found. Please create a new session.";

    return (
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 md:px-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-48 bg-linear-to-b from-cyan-300/85 via-sky-200/45 to-transparent" />

        <Card className="border-teal-300/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-slate-900">
              Session not available
            </CardTitle>
            <CardDescription className="text-base leading-relaxed text-slate-700">
              We could not load this checkout session.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTitle>
                {fetchErrorCode === "SESSION_NOT_FOUND"
                  ? "Session not found"
                  : "Session loading failed"}
              </AlertTitle>
              <AlertDescription>{notFoundMessage}</AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/">Back to Homepage</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSessionExpired = new Date(session.expiresAt).getTime() <= Date.now();

  if (isSessionExpired) {
    return (
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-10 md:px-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-48 bg-linear-to-b from-cyan-300/85 via-sky-200/45 to-transparent" />

        <Card className="border-teal-300/80 shadow-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-slate-900">
              Session expired
            </CardTitle>
            <CardDescription className="text-base leading-relaxed text-slate-700">
              This checkout session is no longer valid.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertTitle>Checkout session has expired</AlertTitle>
              <AlertDescription>
                This session passed its time limit. Please go back to homepage
                and create a new checkout session.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href="/">Back to Homepage</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative mx-auto grid w-full max-w-6xl gap-6 px-4 py-5 md:grid-cols-[1fr_380px] md:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 bg-linear-to-b from-cyan-300/85 via-sky-200/45 to-transparent" />

      <div className="md:col-span-2">
        <Button type="button" variant="outline" asChild>
          <Link href="/">Back to Homepage</Link>
        </Button>
      </div>

      <Card className="border-teal-300/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-slate-900">
            Hosted Checkout Demo (SDK)
          </CardTitle>
          <CardDescription className="text-base leading-relaxed text-slate-700">
            Card data is collected by LuqraToken secure iframes. Final status is
            still confirmed by webhook in backend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="sdk-email">Customer email</Label>
            <Input
              id="sdk-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isPaymentLockedSession || processing || cancelling}
              placeholder="example@example.com"
            />
          </div>

          <div className="rounded-md border border-teal-300/70 bg-cyan-50/55 p-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">SDK Embed Fields</p>
            <p>
              These containers are hydrated by LuqraToken SDK and card data
              never touches this app.
            </p>
          </div>

          <div className="grid gap-2">
            <div
              className="field min-h-11 rounded-md border border-input bg-background px-3 py-2"
              data-auxvault="amount"
            />
            <div
              className="field min-h-11 rounded-md border border-input bg-background px-3 py-2"
              data-auxvault="cardNumber"
            />
            <div
              className="field min-h-11 rounded-md border border-input bg-background px-3 py-2"
              data-auxvault="cardExpiry"
            />
            <div
              className="field min-h-11 rounded-md border border-input bg-background px-3 py-2"
              data-auxvault="cardCvv"
            />
          </div>

          {isSdkConfigMissing ? (
            <Alert variant="destructive">
              <AlertTitle>SDK configuration missing</AlertTitle>
              <AlertDescription>
                Set NEXT_PUBLIC_AUXVAULT_API_KEY and
                NEXT_PUBLIC_AUXVAULT_ENDPOINT to enable SDK checkout mode.
              </AlertDescription>
            </Alert>
          ) : null}

          {sdkInitError ? (
            <Alert variant="destructive">
              <AlertTitle>SDK initialization failed</AlertTitle>
              <AlertDescription>{sdkInitError}</AlertDescription>
            </Alert>
          ) : null}

          <div className={actionError ? "block" : "hidden"}>
            <Alert variant="destructive">
              <AlertTitle>Payment action failed</AlertTitle>
              <AlertDescription>
                {actionError ?? "Unknown payment error"}
              </AlertDescription>
            </Alert>
          </div>

          {isPaymentLockedSession ? (
            <Alert>
              <AlertTitle>
                {session.status === "succeeded"
                  ? "Payment already completed"
                  : session.status === "cancelled"
                    ? "Payment cancelled"
                    : "Payment failed (retries exhausted)"}
              </AlertTitle>
              <AlertDescription>
                {session.status === "succeeded"
                  ? "This checkout session is successful. Payment actions are locked and shown for reference only."
                  : session.status === "cancelled"
                    ? "This checkout session was cancelled. Payment actions are locked and shown for reference only."
                    : "This checkout session reached maximum retry attempts. Payment actions are locked and shown for reference only."}
              </AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                ref={sdkPayButtonRef}
                data-auxvault-button="pay"
                disabled={
                  processing ||
                  cancelling ||
                  isSdkConfigMissing ||
                  Boolean(sdkInitError) ||
                  !sdkScriptLoaded
                }
              >
                {processing ? "Processing..." : "Pay Now"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={processing || cancelling}
                onClick={handleCancel}
              >
                {cancelling ? "Cancelling..." : "Cancel"}
              </Button>
            </div>
          )}

          <div
            id={`result-${sessionId}`}
            ref={resultRef}
            data-auxvault-result
            className="min-h-10 rounded-md border border-dashed border-teal-300/70 bg-cyan-50/40 px-3 py-2 text-sm text-slate-700"
          >
            Waiting for SDK transaction response...
          </div>
        </CardContent>
      </Card>

      <Card className="border-teal-300/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Order/session summary <StatusBadge status={session.status} />
          </CardTitle>
          <CardDescription className="text-base leading-relaxed text-slate-700">
            Current values from backend
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-base">
          <div>
            <p className="text-muted-foreground">Session ID</p>
            <p className="font-mono">{session.sessionId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Order ID</p>
            <p className="font-mono">{session.orderId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Amount</p>
            <p>{formatAmount(session.amount, session.currency)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className="mt-1">
              <StatusBadge status={session.status} />
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Attempt count</p>
            <p>
              {session.attemptCount} / {session.maxAttempts}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Remaining retries</p>
            <p>{remainingAttempts}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Expires at</p>
            <p>{formatDateTime(session.expiresAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Webhook delivered</p>
            <p>{session.webhookDelivered ? "Yes" : "No"}</p>
          </div>
          {session.latestAttempt ? (
            <div className="rounded-md border border-teal-300/75 bg-cyan-100/55 p-3">
              <p className="text-muted-foreground">Latest attempt</p>
              <p>Status: {session.latestAttempt.status}</p>
              <p>Masked card: {session.latestAttempt.maskedCardNumber}</p>
              <p>Response: {session.latestAttempt.responseCode}</p>
              <p>Transaction: {session.latestAttempt.transactionId ?? "-"}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-teal-300/80 shadow-sm md:col-span-2">
        <CardHeader>
          <CardTitle>SDK test guidance</CardTitle>
          <CardDescription className="text-base leading-relaxed text-slate-700">
            Use LuqraToken sandbox cards configured in your SDK dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1.5 text-base text-muted-foreground">
            {sdkTestCards.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
