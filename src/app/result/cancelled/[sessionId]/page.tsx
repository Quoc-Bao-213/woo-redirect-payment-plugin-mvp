import { ResultView } from "@/features/payment/ui/result-view";

export default async function ResultCancelledSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <ResultView
      title="Payment Redirect: Cancelled"
      description="Payment was cancelled by user. Final state is written by webhook processing."
      sessionId={sessionId}
    />
  );
}
