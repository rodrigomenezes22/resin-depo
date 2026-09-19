// =============================================================================
// The TPE logo for export document letterheads
// =============================================================================
// One element used by all five export templates so the artwork is the same
// size everywhere. Server-only by inheritance: `brand.ts` reads the PNG off
// disk at module load, and this module is only ever imported by templates,
// which only the PDF route imports (never a "use client" graph).
//
// When the asset is missing (`TPE_LOGO_DATA_URI === null`) nothing renders and
// the letterhead falls back to the text wordmark the templates already print.
// =============================================================================

import { Image } from "@react-pdf/renderer";

import { TPE_LOGO_ASPECT, TPE_LOGO_DATA_URI } from "@/lib/pdf/brand";

/** Letterhead artwork width in points; height follows the natural aspect. */
export const LOGO_WIDTH = 108;

export function Logo({ width = LOGO_WIDTH }: { width?: number }) {
  if (!TPE_LOGO_DATA_URI) return null;
  return (
    // jsx-a11y sees "Image" and asks for an `alt`. This is @react-pdf/renderer's
    // Image, not an HTML <img> — it renders into a PDF and has no alt prop.
    // eslint-disable-next-line jsx-a11y/alt-text
    <Image
      src={TPE_LOGO_DATA_URI}
      style={{ width, height: width / TPE_LOGO_ASPECT, marginBottom: 4 }}
    />
  );
}
