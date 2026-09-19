"use client";

// =============================================================================
// NewShipmentButton — open an empty booking
// =============================================================================
// A shipment starts empty and in `draft`: the desk usually knows the customer
// and the containers before the line has confirmed a vessel, so every booking
// field is fillable later on the detail page. Containers are added from there.
// =============================================================================

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ClientAPI } from "@/trpc/client";

export function NewShipmentButton() {
  const router = useRouter();
  const utils = ClientAPI.useUtils();
  const create = ClientAPI.exportShipments.createGroup.useMutation({
    onSuccess: async (group) => {
      await utils.exportShipments.list.invalidate();
      router.push(`/shipments/${group.id}`);
    },
  });

  return (
    <Button variant="gold" disabled={create.isPending} onClick={() => create.mutate({})}>
      <Plus className="size-4" />
      {create.isPending ? "Opening…" : "New Shipment"}
    </Button>
  );
}
