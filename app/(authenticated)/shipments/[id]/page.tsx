import { ShipmentDetail } from "@/components/bank/export-shipments/detail";

// Bank → Export Shipments → one booking: the booking card, the container
// manifest, and the audit timeline. Admin-only (route guard).
export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ShipmentDetail id={id} />;
}
