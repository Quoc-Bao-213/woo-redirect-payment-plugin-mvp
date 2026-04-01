import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardTitle,
  CardHeader,
  CardContent,
  CardDescription,
} from "@/components/ui/card";

export function ResultView({
  title,
  description,
  sessionId,
}: {
  title: string;
  description: string;
  sessionId?: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-10 md:px-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Redirect result page is only UX feedback. Final status is updated by
            webhook.
          </p>
          {sessionId ? <p className="font-mono">Session: {sessionId}</p> : null}
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
