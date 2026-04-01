"use client";

import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type SessionDetail = {
  sessionId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: "pending" | "succeeded" | "failed" | "cancelled";
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
  redirectTo: "/result/success" | "/result/failed" | "/result/cancelled";
  message: string;
};

type FormState = {
  email: string;
  cardHolderName: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
};

type FieldErrors = {
  cardNumber?: string;
  expiry?: string;
  cvv?: string;
};

const testCards = [
  "4242 4242 4242 4242 => success",
  "4141 4141 4141 4141 => failed",
  "3232 3232 3232 3232 => insufficient funds",
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

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

function formatCardNumber(value: string) {
  const digits = normalizeDigits(value).slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value: string) {
  const digits = normalizeDigits(value).slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

function validateCardNumber(value: string) {
  const digits = normalizeDigits(value);

  if (digits.length === 0) {
    return "Card number is required";
  }

  if (digits.length !== 16) {
    return "Card number must contain exactly 16 digits";
  }

  return undefined;
}

function validateExpiry(value: string) {
  const digits = normalizeDigits(value);

  if (digits.length === 0) {
    return "Expiry is required";
  }

  if (digits.length < 4) {
    return "Expiry must be in MM / YY format";
  }

  const month = Number(digits.slice(0, 2));
  const yearTwoDigits = Number(digits.slice(2, 4));

  if (month < 1 || month > 12) {
    return "Month must be between 01 and 12";
  }

  const now = new Date();
  const currentYearTwoDigits = now.getFullYear() % 100;
  const currentMonth = now.getMonth() + 1;

  if (
    yearTwoDigits < currentYearTwoDigits ||
    (yearTwoDigits === currentYearTwoDigits && month < currentMonth)
  ) {
    return "Expiry month/year cannot be in the past";
  }

  return undefined;
}

function validateCvv(value: string) {
  const digits = normalizeDigits(value);

  if (digits.length === 0) {
    return "CVV is required";
  }

  if (digits.length < 3 || digits.length > 4) {
    return "CVV must have 3 or 4 digits";
  }

  return undefined;
}

const initialFormState: FormState = {
  email: "",
  cardHolderName: "",
  cardNumber: "",
  expiry: "",
  cvv: "",
};

export function CheckoutClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [form, setForm] = useState<FormState>(initialFormState);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const remainingAttempts = useMemo(() => {
    if (!session) {
      return 0;
    }

    return Math.max(session.maxAttempts - session.attemptCount, 0);
  }, [session]);

  const loadSession = useCallback(async () => {
    try {
      setFetchError(null);
      const response = await fetch(`/api/demo/session/${sessionId}`, {
        method: "GET",
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const parsed = (await response.json()) as SessionDetail;
      setSession(parsed);

      setForm((previous) => ({
        ...previous,
        email: parsed.customerEmail ?? previous.email,
      }));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load checkout session";
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  function onInputChange(field: keyof FormState, value: string) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }

  function onCardNumberChange(value: string) {
    const nextValue = formatCardNumber(value);
    onInputChange("cardNumber", nextValue);
    setFieldErrors((previous) => ({
      ...previous,
      cardNumber: validateCardNumber(nextValue),
    }));
  }

  function onExpiryChange(value: string) {
    const nextValue = formatExpiry(value);
    onInputChange("expiry", nextValue);
    setFieldErrors((previous) => ({
      ...previous,
      expiry: validateExpiry(nextValue),
    }));
  }

  function onCvvChange(value: string) {
    const nextValue = normalizeDigits(value).slice(0, 4);
    onInputChange("cvv", nextValue);
    setFieldErrors((previous) => ({
      ...previous,
      cvv: validateCvv(nextValue),
    }));
  }

  function validatePaymentFields() {
    const nextErrors: FieldErrors = {
      cardNumber: validateCardNumber(form.cardNumber),
      expiry: validateExpiry(form.expiry),
      cvv: validateCvv(form.cvv),
    };

    setFieldErrors(nextErrors);

    return !nextErrors.cardNumber && !nextErrors.expiry && !nextErrors.cvv;
  }

  async function handlePay(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    if (!validatePaymentFields()) {
      return;
    }

    setProcessing(true);

    try {
      const response = await fetch(`/api/demo/session/${sessionId}/pay`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const parsed = (await response.json()) as ActionResponse;
      router.push(`${parsed.redirectTo}/${sessionId}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit payment";
      setActionError(message);
      setProcessing(false);
      await loadSession();
    }
  }

  async function handleCancel() {
    setActionError(null);
    setCancelling(true);

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
      <p className="mx-auto w-full max-w-3xl p-6 text-sm text-muted-foreground">
        Loading checkout session...
      </p>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-3xl p-6">
        <Alert variant="destructive">
          <AlertTitle>Session not available</AlertTitle>
          <AlertDescription>
            {fetchError ?? "Could not find this checkout session."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-8 md:grid-cols-[1fr_360px] md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Hosted Checkout Demo</CardTitle>
          <CardDescription>
            Submit payment details here. Final status is written only by webhook
            processing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handlePay}>
            <div className="grid gap-3">
              <h2 className="text-sm font-medium">Customer information</h2>
              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    onInputChange("email", event.target.value)
                  }
                  required
                />
              </div>
            </div>

            <div className="grid gap-3">
              <h2 className="text-sm font-medium">Payment information</h2>
              <div className="grid gap-1.5">
                <Label htmlFor="card-holder">Card holder name</Label>
                <Input
                  id="card-holder"
                  value={form.cardHolderName}
                  onChange={(event) =>
                    onInputChange("cardHolderName", event.target.value)
                  }
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="card-number">Card number</Label>
                <Input
                  id="card-number"
                  inputMode="numeric"
                  value={form.cardNumber}
                  onChange={(event) => onCardNumberChange(event.target.value)}
                  onBlur={() =>
                    setFieldErrors((previous) => ({
                      ...previous,
                      cardNumber: validateCardNumber(form.cardNumber),
                    }))
                  }
                  placeholder="4242 4242 4242 4242"
                  required
                  aria-invalid={Boolean(fieldErrors.cardNumber)}
                />
                {fieldErrors.cardNumber ? (
                  <p className="text-xs text-destructive">
                    {fieldErrors.cardNumber}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="expiry">Expiry (MM/YY)</Label>
                  <Input
                    id="expiry"
                    inputMode="numeric"
                    value={form.expiry}
                    onChange={(event) => onExpiryChange(event.target.value)}
                    onBlur={() =>
                      setFieldErrors((previous) => ({
                        ...previous,
                        expiry: validateExpiry(form.expiry),
                      }))
                    }
                    placeholder="01 / 30"
                    required
                    aria-invalid={Boolean(fieldErrors.expiry)}
                  />
                  {fieldErrors.expiry ? (
                    <p className="text-xs text-destructive">
                      {fieldErrors.expiry}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="cvv">CVV</Label>
                  <Input
                    id="cvv"
                    inputMode="numeric"
                    maxLength={4}
                    value={form.cvv}
                    onChange={(event) => onCvvChange(event.target.value)}
                    onBlur={() =>
                      setFieldErrors((previous) => ({
                        ...previous,
                        cvv: validateCvv(form.cvv),
                      }))
                    }
                    required
                    aria-invalid={Boolean(fieldErrors.cvv)}
                  />
                  {fieldErrors.cvv ? (
                    <p className="text-xs text-destructive">
                      {fieldErrors.cvv}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {actionError ? (
              <Alert variant="destructive">
                <AlertTitle>Payment action failed</AlertTitle>
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={processing || cancelling}>
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
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Order/session summary</CardTitle>
          <CardDescription>Current values from backend</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
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
            <p className="uppercase">{session.status}</p>
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
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-muted-foreground">Latest attempt</p>
              <p>Status: {session.latestAttempt.status}</p>
              <p>Masked card: {session.latestAttempt.maskedCardNumber}</p>
              <p>Response: {session.latestAttempt.responseCode}</p>
              <p>Transaction: {session.latestAttempt.transactionId ?? "-"}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Test cards for demo</CardTitle>
          <CardDescription>
            Use these test card numbers on hosted checkout
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {testCards.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
