"use client";

// =============================================================================
// Booking — the shipment-level card
// =============================================================================
// Everything the whole shipment shares, read in the order the desk fills it in:
//   1. identity — booking no., master B/L, incoterm, status
//   2. the voyage — carrier, vessel, voyage no., ETA/ETD
//   3. the route — load/discharge ports, place of receipt/delivery
//   4. notes
// Each row sums to 12 grid columns, so the groups stay on their own lines.
// =============================================================================

import { useState } from "react";
import { ClipboardList } from "lucide-react";

import {
  Cell,
  Grid,
  SELECT_POPUP,
  SELECT_TRIGGER,
  Section,
  UpdateButton,
} from "@/components/bank/chrome";
import { GROUP_STATUSES } from "@/components/bank/export-shipments/group-status";
import type { ShipmentGroupRow } from "@/components/bank/export-shipments/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ClientAPI } from "@/trpc/client";

const INCOTERMS = ["EXW", "FCA", "FAS", "FOB", "CFR", "CIF", "DAP", "DDP"] as const;

const NONE = "none";

export function Booking({ group, onSaved }: { group: ShipmentGroupRow; onSaved: () => void }) {
  const [status, setStatus] = useState(group.status);
  const [incoterm, setIncoterm] = useState(group.incoterm);
  const [carrierOrgId, setCarrierOrgId] = useState(group.carrier_org_id ?? NONE);
  const [vesselName, setVesselName] = useState(group.vessel_name ?? "");
  const [voyageNumber, setVoyageNumber] = useState(group.voyage_number ?? "");
  const [masterBl, setMasterBl] = useState(group.master_bl_number ?? "");
  const [bookingNumber, setBookingNumber] = useState(group.booking_number ?? "");
  const [pol, setPol] = useState(group.pol_location_id ?? NONE);
  const [pod, setPod] = useState(group.pod_location_id ?? NONE);
  const [placeOfReceipt, setPlaceOfReceipt] = useState(group.place_of_receipt ?? "");
  const [placeOfDelivery, setPlaceOfDelivery] = useState(group.place_of_delivery ?? "");
  const [etd, setEtd] = useState(group.etd ?? "");
  const [eta, setEta] = useState(group.eta ?? "");
  const [notes, setNotes] = useState(group.notes ?? "");

  // No effect re-seeding these from `group`. This card is the only writer of
  // every field it renders — a manifest change refetches the shipment but
  // cannot alter the booking — so the inputs are already what the user last
  // typed or last saved. Syncing them in an effect would only add a cascading
  // render, and would fight anyone mid-edit when a sibling section refetched.
  const carriers = ClientAPI.reference.carriers.useQuery();
  const ports = ClientAPI.locations.list.useQuery({ kinds: ["port"] });

  const update = ClientAPI.exportShipments.updateGroup.useMutation({ onSuccess: onSaved });

  const save = () =>
    update.mutate({
      id: group.id,
      status,
      incoterm,
      carrierOrgId: carrierOrgId === NONE ? null : carrierOrgId,
      vesselName: vesselName.trim() || null,
      voyageNumber: voyageNumber.trim() || null,
      masterBlNumber: masterBl.trim() || null,
      bookingNumber: bookingNumber.trim() || null,
      polLocationId: pol === NONE ? null : pol,
      podLocationId: pod === NONE ? null : pod,
      placeOfReceipt: placeOfReceipt.trim() || null,
      placeOfDelivery: placeOfDelivery.trim() || null,
      etd: etd || null,
      eta: eta || null,
      notes: notes.trim() || null,
    });

  const portLabel = (id: string) => {
    const p = ports.data?.find((x) => x.id === id);
    if (!p) return "Select port";
    return p.unlocode ? `${p.name} (${p.unlocode})` : p.name;
  };

  return (
    // Renders its own Section — the save button lives in the header slot.
    <Section
      title="Booking"
      subtitle="Vessel, voyage, ports & dates"
      icon={ClipboardList}
      actions={<UpdateButton label="Update Booking" pending={update.isPending} onClick={save} />}
    >
      <Grid>
        {/* Row 1 — identity: 4 + 4 + 2 + 2 */}
        <Cell label="Booking #" span={4} htmlFor="bookingNumber">
          <Input
            id="bookingNumber"
            className="h-8"
            value={bookingNumber}
            placeholder="Not booked yet"
            onChange={(e) => setBookingNumber(e.target.value)}
          />
        </Cell>

        <Cell label="Master B/L #" span={4} htmlFor="masterBl">
          <Input
            id="masterBl"
            className="h-8"
            value={masterBl}
            onChange={(e) => setMasterBl(e.target.value)}
          />
        </Cell>

        <Cell label="Incoterm" span={2}>
          <Select value={incoterm} onValueChange={(v) => v && setIncoterm(v as typeof incoterm)}>
            <SelectTrigger className={SELECT_TRIGGER} aria-label="Incoterm">
              <SelectValue>{incoterm}</SelectValue>
            </SelectTrigger>
            <SelectContent className={SELECT_POPUP}>
              {INCOTERMS.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Cell>

        <Cell label="Status" span={2}>
          <Select value={status} onValueChange={(v) => v && setStatus(v as typeof status)}>
            <SelectTrigger className={SELECT_TRIGGER} aria-label="Shipment status">
              <SelectValue>{GROUP_STATUSES.find(([v]) => v === status)?.[1] ?? status}</SelectValue>
            </SelectTrigger>
            <SelectContent className={SELECT_POPUP}>
              {GROUP_STATUSES.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Cell>

        {/* Row 2 — the voyage: 3 + 3 + 2 + 2 + 2 */}
        <Cell label="Ocean Carrier" span={3}>
          <Select value={carrierOrgId} onValueChange={(v) => v && setCarrierOrgId(v)}>
            <SelectTrigger className={SELECT_TRIGGER} aria-label="Ocean carrier">
              <SelectValue>
                {carrierOrgId === NONE
                  ? "—"
                  : (carriers.data?.find((c) => c.id === carrierOrgId)?.name ?? "Select carrier")}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className={SELECT_POPUP}>
              <SelectItem value={NONE}>—</SelectItem>
              {(carriers.data ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Cell>

        <Cell label="Vessel" span={3} htmlFor="vessel">
          <Input
            id="vessel"
            className="h-8"
            value={vesselName}
            placeholder="Not booked yet"
            onChange={(e) => setVesselName(e.target.value)}
          />
        </Cell>

        <Cell label="Voyage #" span={2} htmlFor="voyage">
          <Input
            id="voyage"
            className="h-8"
            value={voyageNumber}
            onChange={(e) => setVoyageNumber(e.target.value)}
          />
        </Cell>

        <Cell label="ETA" span={2} htmlFor="eta">
          <Input
            id="eta"
            type="date"
            className="h-8"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
          />
        </Cell>

        <Cell label="ETD" span={2} htmlFor="etd">
          <Input
            id="etd"
            type="date"
            className="h-8"
            value={etd}
            onChange={(e) => setEtd(e.target.value)}
          />
        </Cell>

        {/* Row 3 — the route: 3 + 3 + 3 + 3 */}
        <Cell label="Port of Loading" span={3}>
          <Select value={pol} onValueChange={(v) => v && setPol(v)}>
            <SelectTrigger className={SELECT_TRIGGER} aria-label="Port of loading">
              <SelectValue>{pol === NONE ? "—" : portLabel(pol)}</SelectValue>
            </SelectTrigger>
            <SelectContent className={SELECT_POPUP}>
              <SelectItem value={NONE}>—</SelectItem>
              {(ports.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.unlocode ? `${p.name} (${p.unlocode})` : p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Cell>

        <Cell label="Port of Discharge" span={3}>
          <Select value={pod} onValueChange={(v) => v && setPod(v)}>
            <SelectTrigger className={SELECT_TRIGGER} aria-label="Port of discharge">
              <SelectValue>{pod === NONE ? "—" : portLabel(pod)}</SelectValue>
            </SelectTrigger>
            <SelectContent className={SELECT_POPUP}>
              <SelectItem value={NONE}>—</SelectItem>
              {(ports.data ?? []).map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.unlocode ? `${p.name} (${p.unlocode})` : p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Cell>

        <Cell label="Place of Receipt" span={3} htmlFor="por">
          <Input
            id="por"
            className="h-8"
            value={placeOfReceipt}
            onChange={(e) => setPlaceOfReceipt(e.target.value)}
          />
        </Cell>

        <Cell label="Place of Delivery" span={3} htmlFor="pod-place">
          <Input
            id="pod-place"
            className="h-8"
            value={placeOfDelivery}
            onChange={(e) => setPlaceOfDelivery(e.target.value)}
          />
        </Cell>

        <Cell label="Notes" span={12} htmlFor="shipment-notes">
          <Textarea
            id="shipment-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Cell>
      </Grid>
    </Section>
  );
}
