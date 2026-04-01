import { ResultView } from "@/features/payment/ui/result-view";

export default async function ResultFailedSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <ResultView
      title="Payment Redirect: Failed"
      description="Payment failed on hosted checkout. Final status is still confirmed by webhook."
      sessionId={sessionId}
    />
  );
}
