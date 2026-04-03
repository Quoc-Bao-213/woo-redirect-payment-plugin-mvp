import { CheckoutClient } from "@/features/payment/ui/checkout-client";
import { CheckoutSdkClient } from "@/features/payment/ui/checkout-sdk-client";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const mode = process.env.PAYMENT_UI_MODE?.toLowerCase() === "sdk" ? "sdk" : "native";

  if (mode === "sdk") {
    return <CheckoutSdkClient sessionId={sessionId} />;
  }

  return <CheckoutClient sessionId={sessionId} />;
}
