// =============================================================================
// Export document status vocabulary
// =============================================================================
// Single source of the `shipment_doc_status` labels + chip, the same shape as
// group-status.tsx. Typed as a TOTAL Record, so adding an enum value is a
// compile error rather than a silently blank cell.
// =============================================================================

import { FileText, Ban, CheckCircle2, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StatusBadge } from "@/components/ui/status-badge";
import type { ShipmentDocStatus } from "@/lib/export-shipment/documents/types";

type Tone = React.ComponentProps<typeof StatusBadge>["tone"];

const DOC_STATUS_META: Record<ShipmentDocStatus, { label: string; tone: Tone; icon: LucideIcon }> =
  {
    draft: { label: "Draft", tone: "neutral", icon: FileText },
    issued: { label: "Issued", tone: "finished", icon: CheckCircle2 },
    superseded: { label: "Superseded", tone: "warning", icon: Layers },
    void: { label: "Void", tone: "danger", icon: Ban },
  };

export const DOC_STATUS_LABELS: Record<ShipmentDocStatus, string> = {
  draft: DOC_STATUS_META.draft.label,
  issued: DOC_STATUS_META.issued.label,
  superseded: DOC_STATUS_META.superseded.label,
  void: DOC_STATUS_META.void.label,
};

export function DocStatusBadge({ status }: { status: ShipmentDocStatus }) {
  const meta = DOC_STATUS_META[status];
  return (
    <StatusBadge tone={meta.tone} icon={meta.icon}>
      {meta.label}
    </StatusBadge>
  );
}
