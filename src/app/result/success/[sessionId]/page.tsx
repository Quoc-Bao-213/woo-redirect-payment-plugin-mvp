import { ResultView } from "@/features/payment/ui/result-view";

export default async function ResultSuccessSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <ResultView
      title="Payment Redirect: Success"
      description="Payment was submitted successfully. Wait for webhook update to confirm final status."
      sessionId={sessionId}
    />
  );
}
