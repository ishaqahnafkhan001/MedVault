import { QueryClient } from "@tanstack/react-query";

export function createPrivateQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } });
}
