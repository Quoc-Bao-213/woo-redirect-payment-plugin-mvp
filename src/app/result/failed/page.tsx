import { ResultView } from "@/features/payment/ui/result-view";

function getSessionId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function ResultFailedPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string | string[] }>;
}) {
  const params = await searchParams;

  return (
    <ResultView
      title="Payment Redirect: Failed"
      description="Payment failed on hosted checkout. Final status is still confirmed by webhook."
      sessionId={getSessionId(params.sessionId)}
      expectedStatus="failed"
    />
  );
}
