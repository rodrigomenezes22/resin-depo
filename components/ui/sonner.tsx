"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

// Toast host (sonner). Mounted once in the root layout. Mutation errors toast
// globally via the QueryClient's MutationCache; success toasts are fired
// per-site with specific copy (e.g. toast.success("Company created")).
// resin-depo has no theme switcher, so the theme is fixed (TPE reads next-themes).
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      richColors
      closeButton
      position="top-right"
      {...props}
    />
  );
}
