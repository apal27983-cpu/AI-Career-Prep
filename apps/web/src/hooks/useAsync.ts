import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: unknown;
}

export interface AsyncQuery<T> extends AsyncState<T> {
  reload: () => Promise<void>;
  /** Replaces the cached value without a round trip, after a successful write. */
  setData: (value: T | null) => void;
}

/**
 * Loads data on mount and exposes an explicit reload for retry buttons. Each
 * call site gets its own independent loading and error state.
 */
export function useAsyncQuery<T>(
  loader: () => Promise<T>,
  dependencies: unknown[] = [],
): AsyncQuery<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const mounted = useRef(true);
  // Lets the effect depend on the dependency list rather than on the closure.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const data = await loaderRef.current();
      if (mounted.current) setState({ data, loading: false, error: null });
    } catch (error) {
      if (mounted.current) setState({ data: null, loading: false, error });
    }
  }, []);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  const setData = useCallback((value: T | null) => {
    setState((current) => ({ ...current, data: value }));
  }, []);

  return { ...state, reload: run, setData };
}

export interface AsyncAction<Args extends unknown[], T> {
  run: (...args: Args) => Promise<T | null>;
  loading: boolean;
  error: unknown;
  reset: () => void;
}

/**
 * Wraps a one-shot action (submit, upload, analyse). Concurrent calls are
 * rejected while one is in flight, which is what stops duplicate submissions.
 */
export function useAsyncAction<Args extends unknown[], T>(
  action: (...args: Args) => Promise<T>,
  options: { onSuccess?: (value: T) => void; onError?: (error: unknown) => void } = {},
): AsyncAction<Args, T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const actionRef = useRef(action);
  actionRef.current = action;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: Args): Promise<T | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setLoading(true);
    setError(null);

    try {
      const result = await actionRef.current(...args);
      optionsRef.current.onSuccess?.(result);
      return result;
    } catch (caught) {
      if (mounted.current) setError(caught);
      optionsRef.current.onError?.(caught);
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);

  return { run, loading, error, reset };
}
