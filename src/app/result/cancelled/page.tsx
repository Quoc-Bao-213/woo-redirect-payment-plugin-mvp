import { ResultView } from "@/features/payment/ui/result-view";

function getSessionId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function ResultCancelledPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string | string[] }>;
}) {
  const params = await searchParams;

  return (
    <ResultView
      title="Payment Redirect: Cancelled"
      description="Payment was cancelled by user. Final state is written by webhook processing."
      sessionId={getSessionId(params.sessionId)}
    />
  );
}
