import { ExportShipments } from "@/components/bank/export-shipments";

// Bank → Export Shipments — ocean bookings that group container transactions.
// Admin-only; gated by the route guard like the rest of the Bank area.
export default function ExportShipmentsPage() {
  return <ExportShipments />;
}
