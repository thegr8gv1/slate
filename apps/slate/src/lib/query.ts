import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

/**
 * Minimal async-data hook.
 *
 * A full cache library would be the right call for a large team, but the app's
 * data access is straightforward request-per-screen, so this keeps the
 * dependency surface small while still getting the parts that matter:
 * cancellation on unmount, a stable refetch, and an explicit error object.
 */

export interface QueryState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** True on a background refresh while stale data is still on screen. */
  refreshing: boolean;
  refetch: () => void;
  setData: (updater: T | ((current: T | null) => T | null)) => void;
}

export function useQuery<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = [],
  options: { enabled?: boolean } = {},
): QueryState<T> {
  const enabled = options.enabled ?? true;
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  const hasData = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;

    if (hasData.current) setRefreshing(true);
    else setLoading(true);

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (cancelled) return;
        hasData.current = true;
        setDataState(result);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, 'UNKNOWN', caught instanceof Error ? caught.message : String(caught)),
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, nonce, ...deps]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  const setData = useCallback((updater: T | ((current: T | null) => T | null)) => {
    setDataState((current) =>
      typeof updater === 'function' ? (updater as (c: T | null) => T | null)(current) : updater,
    );
  }, []);

  return { data, error, loading, refreshing, refetch, setData };
}

/**
 * Mutation helper with an `inFlight` guard so a double-tapped button cannot
 * fire the same escrow release or beacon claim twice.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  run: (...args: TArgs) => Promise<TResult>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const inFlight = useRef(false);

  // `mutate` is deliberately stable so callers can pass it straight to an
  // onPress without re-rendering. That means the callback itself must be read
  // through a ref: capturing it in the closure would freeze whatever state it
  // referenced on first render — e.g. a projectId that was still null.
  const runRef = useRef(run);
  runRef.current = run;

  const mutate = useCallback(
    async (...args: TArgs): Promise<TResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setPending(true);
      setError(null);
      try {
        return await runRef.current(...args);
      } catch (caught: unknown) {
        setError(
          caught instanceof ApiError
            ? caught
            : new ApiError(0, 'UNKNOWN', caught instanceof Error ? caught.message : String(caught)),
        );
        return null;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { mutate, pending, error, clearError: () => setError(null) };
}
