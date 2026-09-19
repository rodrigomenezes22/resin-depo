import { defaultShouldDehydrateQuery, MutationCache, QueryClient } from "@tanstack/react-query";
import superjson from "superjson";
import { toast } from "sonner";

export function makeQueryClient() {
  return new QueryClient({
    // Global mutation-error feedback: every failed mutation surfaces a toast
    // without per-call-site wiring (only fires client-side — mutations don't run
    // during SSR). Opt out per-mutation with `meta: { suppressErrorToast: true }`.
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.suppressErrorToast) return;
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
