"use client";

// =============================================================================
// CoveredContainers — the container table inside every document drawer
// =============================================================================
// Same columns, same order, same formatters as the shipment page's Manifest:
//   # · Order # · Product · Container # · Seal # · Packages ·
//   Contract (lbs) · Contract (MT) · Net (lbs) · Gross (lbs)
//
// Two tables describing one set of boxes have to agree, so the numbers here are
// the manifest's numbers: contract weight from the deal, MT derived from lbs
// (never stored twice), and weights shown in POUNDS even though the payload
// carries kilograms — the drawer used to print kg beside a manifest in lbs,
// which read as a disagreement.
//
// Rows come from InvoiceLine, so a document issued before `orderNumber` /
// `productName` existed simply shows "—" in those two columns rather than
// failing to open.
// =============================================================================

import type { ShipmentGroupRow } from "@/components/bank/export-shipments/types";
import type { InvoiceLine } from "@/lib/export-shipment/documents/types";
import { formatPackages } from "@/components/bank/export-shipments/package-kinds";
import {
  dealOrderNumber,
  kilogramsToLbs,
  lbsToKilograms,
  lbsToMetricTons,
  type OrderUnit,
} from "@/lib/units";

const lbs = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

const mt = (n: number | null) =>
  n == null
    ? "—"
    : lbsToMetricTons(n).toLocaleString("en-US", {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      });

/**
 * Manifest rows for a document whose payload carries no `lines` array — the
 * Certificate of Origin describes the shipment in aggregate (one weight, one
 * container summary), so its drawer had nothing to list. The boxes are the
 * same boxes; read them off the booking instead.
 */
export function linesFromContainers(containers: ShipmentGroupRow["containers"]): InvoiceLine[] {
  return containers.map((c) => {
    const mo = c.matched_orders;
    const contractLbs = Number(mo?.quantity_lbs ?? 0);
    const netLbs = c.net_weight_lbs == null ? contractLbs : Number(c.net_weight_lbs);
    const grossLbs = c.gross_weight_lbs == null ? netLbs : Number(c.gross_weight_lbs);
    return {
      containerId: c.id,
      position: c.position,
      containerNumber: c.container_number,
      sealNumber: c.seal_number,
      containerType: c.container_type,
      orderNumber: mo
        ? dealOrderNumber({
            display_number: mo.display_number,
            unit: mo.unit as OrderUnit,
            qty: Number(mo.qty),
            parent_display_number: c.parent_display_number,
            leg_index: mo.leg_index,
          })
        : null,
      productName: mo?.products?.name ?? mo?.product_text ?? null,
      netWeightKg: lbsToKilograms(netLbs),
      grossWeightKg: lbsToKilograms(grossLbs),
      packageCount: c.package_count,
      packageKind: c.package_kind,
      palletCount: c.pallet_count,
      contractLbs,
      unitPrice: Number(mo?.tpe_sell_price ?? 0),
      lineTotal: Number(mo?.tpe_sell_price ?? 0) * contractLbs,
      freight: Number(mo?.freight ?? 0),
    };
  });
}

export function CoveredContainers({
  lines,
  covered,
  onToggle,
  disabled,
}: {
  lines: InvoiceLine[];
  covered: Set<string>;
  onToggle: (containerId: string) => void;
  disabled: boolean;
}) {
  if (!lines.length) {
    return <p className="text-muted-foreground text-xs">No containers on this shipment yet.</p>;
  }

  return (
    // The table is wider than the drawer on a small laptop; it scrolls inside
    // its own box so the form itself never scrolls sideways.
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] border-separate border-spacing-0 text-xs">
        <thead>
          <tr className="text-muted-foreground [&>th]:border-b [&>th]:px-2 [&>th]:py-1.5 [&>th]:font-medium">
            <th className="w-8" />
            <th className="w-8 text-right">#</th>
            <th className="text-left">Order #</th>
            <th className="text-left">Product</th>
            <th className="text-left">Container #</th>
            <th className="text-left">Seal #</th>
            <th className="text-right">Packages</th>
            <th className="text-right">Contract (lbs)</th>
            <th className="text-right">Contract (MT)</th>
            <th className="text-right">Net (lbs)</th>
            <th className="text-right">Gross (lbs)</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const isCovered = covered.has(line.containerId);
            return (
              <tr
                key={line.containerId}
                data-covered={isCovered}
                className="[&>td]:border-b [&>td]:px-2 [&>td]:py-1.5 not-data-[covered=true]:opacity-55"
              >
                <td>
                  <input
                    type="checkbox"
                    className="size-4 align-middle"
                    aria-label={`Cover container ${line.position}${
                      line.containerNumber ? ` ${line.containerNumber}` : ""
                    }`}
                    checked={isCovered}
                    disabled={disabled}
                    onChange={() => onToggle(line.containerId)}
                  />
                </td>
                <td className="text-muted-foreground text-right tabular-nums">{line.position}</td>
                <td className="font-medium">{line.orderNumber ?? "—"}</td>
                <td>{line.productName ?? "—"}</td>
                <td className="font-mono">
                  {line.containerNumber ?? (
                    <span className="text-muted-foreground">Not stuffed</span>
                  )}
                </td>
                <td className="font-mono">{line.sealNumber ?? "—"}</td>
                <td className="text-right tabular-nums">
                  {formatPackages(line.packageCount, line.packageKind) ?? "—"}
                </td>
                <td className="text-right tabular-nums">{lbs(line.contractLbs)}</td>
                <td className="text-right tabular-nums">{mt(line.contractLbs)}</td>
                <td className="text-right tabular-nums">{lbs(kilogramsToLbs(line.netWeightKg))}</td>
                <td className="text-right tabular-nums">
                  {lbs(kilogramsToLbs(line.grossWeightKg))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
