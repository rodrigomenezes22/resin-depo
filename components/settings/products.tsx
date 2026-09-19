"use client";

import { useState } from "react";
import { Package, Plus } from "lucide-react";
import { toast } from "sonner";

import { Cell, Grid, SELECT_POPUP, SELECT_TRIGGER, Section } from "@/components/bank/chrome";
import { Button } from "@/components/ui/button";
import { DataGrid, type DataGridColumn } from "@/components/ui/data-grid";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientAPI } from "@/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/trpc/routers/_app";

export type ProductRow = inferRouterOutputs<AppRouter>["reference"]["products"]["list"][number];

const UNITS: [ProductRow["base_unit"], string][] = [
  ["lb", "Pounds (lb)"],
  ["kg", "Kilograms (kg)"],
  ["mt", "Metric tons (mt)"],
];

/** Create / edit drawer. Also opened inline from the container drawer. */
export function ProductSheet({
  product,
  onClose,
  onSaved,
}: {
  product?: ProductRow | null;
  onClose: () => void;
  onSaved: (product: ProductRow) => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [baseUnit, setBaseUnit] = useState(product?.base_unit ?? "lb");
  const [hsCode, setHsCode] = useState(product?.hs_code ?? "");
  const [origin, setOrigin] = useState(product?.country_of_origin ?? "United States");
  const create = ClientAPI.reference.products.create.useMutation();
  const update = ClientAPI.reference.products.update.useMutation();
  const pending = create.isPending || update.isPending;

  async function save() {
    if (!name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const fields = {
      name: name.trim(),
      baseUnit: baseUnit as "lb",
      hsCode,
      countryOfOrigin: origin,
    };
    try {
      const saved = product
        ? await update.mutateAsync({ id: product.id, ...fields })
        : await create.mutateAsync(fields);
      toast.success(product ? "Product updated" : "Product created");
      onSaved(saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the product.");
    }
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="text-base">{product ? "Edit product" : "New product"}</SheetTitle>
          <SheetDescription>
            The HS code and country of origin print on the Commercial Invoice and the Certificate of
            Origin.
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 pb-6">
          <Grid>
            <Cell label="Product / grade" span={12} htmlFor="product-name">
              <Input
                id="product-name"
                className="h-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Cell>
            <Cell label="Base unit" span={6}>
              <Select value={baseUnit} onValueChange={(v) => v && setBaseUnit(v)}>
                <SelectTrigger className={SELECT_TRIGGER} aria-label="Base unit">
                  <SelectValue>{UNITS.find(([v]) => v === baseUnit)?.[1]}</SelectValue>
                </SelectTrigger>
                <SelectContent className={SELECT_POPUP}>
                  {UNITS.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Cell>
            <Cell label="HS code" span={6} htmlFor="product-hs">
              <Input
                id="product-hs"
                className="h-8 font-mono"
                placeholder="3901.20.00"
                value={hsCode}
                onChange={(e) => setHsCode(e.target.value)}
              />
            </Cell>
            <Cell label="Country of origin" span={12} htmlFor="product-origin">
              <Input
                id="product-origin"
                className="h-8"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
              />
            </Cell>
          </Grid>
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-2 border-t p-6">
          <Button variant="outline" size="sm" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="blue" size="sm" onClick={save} disabled={pending}>
            {pending ? "Saving…" : product ? "Save changes" : "Create product"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function Products() {
  const list = ClientAPI.reference.products.list.useQuery();
  const utils = ClientAPI.useUtils();
  const [sheet, setSheet] = useState<{ mode: "new" } | { mode: "edit"; row: ProductRow } | null>(
    null,
  );

  const columns: DataGridColumn<ProductRow>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      cell: (r) => (
        <button
          type="button"
          className="text-table-link font-medium hover:underline"
          onClick={() => setSheet({ mode: "edit", row: r })}
        >
          {r.name}
        </button>
      ),
      accessor: (r) => r.name,
    },
    { key: "hs_code", header: "HS code", accessor: (r) => r.hs_code ?? "" },
    { key: "country_of_origin", header: "Origin", accessor: (r) => r.country_of_origin ?? "" },
    { key: "base_unit", header: "Unit", accessor: (r) => r.base_unit },
  ];

  const onSaved = () => {
    void utils.reference.products.invalidate();
    setSheet(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <Section
        title="Products"
        subtitle="Resin grades with their HS code and country of origin"
        icon={Package}
        actions={
          <Button variant="gold" size="sm" onClick={() => setSheet({ mode: "new" })}>
            <Plus /> New product
          </Button>
        }
      >
        <DataGrid
          label="Products"
          columns={columns}
          rows={list.data ?? []}
          rowKey={(r) => r.id}
          searchable
          searchPlaceholder="Search products…"
          emptyMessage={list.isLoading ? "Loading…" : "No products yet."}
        />
      </Section>
      {sheet?.mode === "new" && <ProductSheet onClose={() => setSheet(null)} onSaved={onSaved} />}
      {sheet?.mode === "edit" && (
        <ProductSheet product={sheet.row} onClose={() => setSheet(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
