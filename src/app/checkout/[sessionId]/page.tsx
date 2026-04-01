import { CheckoutClient } from "@/features/payment/ui/checkout-client";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return <CheckoutClient sessionId={sessionId} />;
}
