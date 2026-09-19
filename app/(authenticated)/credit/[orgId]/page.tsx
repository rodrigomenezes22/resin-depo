import { BuyerCredit } from "@/components/credit/buyer-credit";

export default async function BuyerCreditPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  return <BuyerCredit orgId={orgId} />;
}
