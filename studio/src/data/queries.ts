// What the studio endpoint is asked, through TanStack Query: one cache, one place that notices the key
// cookie is gone (any request answering 401 locks the app), and polling that stops while the page is
// hidden. Every poll keeps the studio container awake, and a phone in a pocket should let it sleep.
import {
  MutationCache,
  QueryCache,
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { atom, getDefaultStore } from "jotai";

import { api, Locked, type Gpu } from "@/data/api";
import type { Catalog } from "@/domain/catalog";

export type Auth = "checking" | "locked" | "open";
/** Kept in Jotai's default store, outside any workspace: the login screen replaces everything. */
export const authAtom = atom<Auth>("checking");
export const lockApp = () => getDefaultStore().set(authAtom, "locked");

const onError = (e: unknown) => e instanceof Locked && lockApp();

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof Locked) && n < 2, refetchOnWindowFocus: false },
  },
});

const EMPTY_CATALOG: Catalog = { models: [], families: [], loras: [] };

/** The models, families and LoRAs on the volume. */
export function useCatalog() {
  const q = useQuery({ queryKey: ["catalog"], queryFn: api.models, staleTime: Infinity });
  return { catalog: q.data ?? EMPTY_CATALOG, error: q.error, loading: q.isPending };
}

/** The GPU worker, every 5 s while the page is visible. `at` is when it was read, for the countdown. */
export function useGpu() {
  const q = useQuery({
    queryKey: ["gpu"],
    queryFn: api.gpu,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  return { gpu: q.data ?? null, at: q.dataUpdatedAt };
}

/** Wake, stop, force stop and stop-after: each answers with the worker's new state. */
export function useGpuAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (run: () => Promise<Gpu>) => run(),
    onSuccess: (gpu) => client.setQueryData(["gpu"], gpu),
  });
}

/** Seconds until the worker sleeps, counted down between polls. */
export function idlesIn({ gpu, at }: ReturnType<typeof useGpu>, now: number) {
  return gpu?.idles_in == null ? null : Math.max(0, gpu.idles_in - (now - at) / 1000);
}
