import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError, setCsrfToken } from "./api/client";

export const ME_KEY = ["me"] as const;

/** A 401 from any request means the session ended: clear auth so ProtectedRoute redirects to login. */
export function createQueryClient(): QueryClient {
  const onUnauthorized = (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) {
      setCsrfToken(null);
      const qc = client;
      if (qc.getQueryData(ME_KEY) !== null) qc.setQueryData(ME_KEY, null);
    }
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError: onUnauthorized }),
    mutationCache: new MutationCache({ onError: onUnauthorized }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      },
    },
  });
  return client;
}
