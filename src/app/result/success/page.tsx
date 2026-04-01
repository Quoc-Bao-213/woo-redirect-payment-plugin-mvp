import { ResultView } from "@/features/payment/ui/result-view";

function getSessionId(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export default async function ResultSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ sessionId?: string | string[] }>;
}) {
  const params = await searchParams;

  return (
    <ResultView
      title="Payment Redirect: Success"
      description="Payment was submitted successfully. Wait for webhook update to confirm final status."
      sessionId={getSessionId(params.sessionId)}
      expectedStatus="succeeded"
    />
  );
}
