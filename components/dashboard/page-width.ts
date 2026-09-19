/**
 * Width cap for form-shaped pages — Order Entry, International Order Entry,
 * Transaction Details, and every other page whose content is labelled fields
 * rather than a wide data grid.
 *
 * `max-w-7xl` is Tailwind's 80rem / **1280px** stop. This is a deliberate,
 * user-set product decision: uncapped (or 1920px-capped) forms stretch on
 * ultrawide displays until labels lose their fields and rows become
 * unreadable. **Do not widen or remove this** — board/grid pages
 * (Manage Containers/Railcars/Truckloads) keep their own wider cap because
 * tables genuinely benefit from the extra columns.
 *
 * Usage:
 * ```tsx
 * <div className={cn(FORM_PAGE_WIDTH, "flex flex-col gap-4")}>…</div>
 * ```
 */
export const FORM_PAGE_WIDTH = "mx-auto w-full max-w-7xl";
