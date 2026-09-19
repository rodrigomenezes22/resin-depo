import type { LucideIcon } from "lucide-react";
import { CircleDashed, Eye, ListChecks, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

// =============================================================================
// StatusBadge — pill status badges (Figma node 576:17429)
// =============================================================================
// Rounded-full pill with a leading icon + label. The Figma defines four
// canonical states plus we add neutral/blue for reuse across the app
// (Pending / Approved / Rejected on the Credit Application flow, deal states,
// etc.). Readable on BOTH the dark shell and the light DataGrid rows.
// =============================================================================

type Tone =
  | "in-progress"
  | "in-review"
  | "todo"
  | "finished"
  | "neutral"
  | "info"
  | "warning"
  | "danger"
  | "success";

// SOLID, saturated pills — self-contained (own bg + contrasting text) so they
// read identically on the light DataGrid rows AND the dark shell, in both
// light and dark mode. Translucent `/15` tints washed out on the light rows;
// these are the "colorful" Figma treatment. Text color is white on the deep
// colors and near-black on the bright amber/gold, each ≥4.5:1.
const TONES: Record<Tone, { class: string; icon?: LucideIcon }> = {
  // Figma-named states.
  "in-progress": { class: "bg-amber-400 text-[#171717]", icon: CircleDashed },
  "in-review": { class: "bg-tpe-gold text-[#171717]", icon: Eye },
  todo: { class: "bg-red-600 text-white", icon: ListChecks },
  finished: { class: "bg-emerald-600 text-white", icon: CheckCircle2 },
  // Generic semantic tones.
  neutral: { class: "bg-slate-500 text-white" },
  info: { class: "bg-sky-600 text-white" },
  warning: { class: "bg-amber-500 text-[#171717]" },
  danger: { class: "bg-red-600 text-white" },
  success: { class: "bg-emerald-600 text-white" },
};

export function StatusBadge({
  tone = "neutral",
  icon: iconOverride,
  children,
  className,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  const spec = TONES[tone];
  const Icon = iconOverride ?? spec.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap",
        spec.class,
        className,
      )}
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  );
}
