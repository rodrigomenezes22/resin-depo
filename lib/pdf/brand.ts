// =============================================================================
// The logo, as a PDF-embeddable image
// =============================================================================
// `@react-pdf/renderer` renders PNG and JPEG. It does NOT render an SVG FILE —
// its `<Svg>` component draws inline primitives, and handing `<Image>` a `.svg`
// produces a broken document rather than an error. So the nav's
// `/tpe-logo.svg` cannot be used directly; `public/images/tpe-transparent-black
// .png` is the same lockup as a raster, and black artwork is what a printed
// document wants.
//
// READ ONCE, AT MODULE LOAD. The templates take their payload and nothing else
// — no I/O at render time — so this resolves when the module is first imported
// and every render after that is a constant lookup.
//
// A MISSING FILE IS NOT AN ERROR. If the asset cannot be read (a bundling
// surprise, a stripped `public/`), this is null and the templates fall back to
// the text wordmark. An invoice without its logo is still a valid invoice; a
// route that throws while rendering one is not.
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Natural size of the artwork, for callers sizing it without distortion. */
export const TPE_LOGO_ASPECT = 158 / 75;

function loadLogo(): string | null {
  try {
    const file = join(process.cwd(), "public", "images", "tpe-transparent-black.png");
    return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
  } catch {
    // Deliberately silent: this runs at import, and a log here would fire on
    // every cold start of every route that touches a PDF.
    return null;
  }
}

/** The logo as a data URI, or null when the asset could not be read. */
export const TPE_LOGO_DATA_URI: string | null = loadLogo();
