import { useState, useEffect, useRef, useCallback } from 'preact/hooks';

// Ensure event name never collides with 3rd party code
const refetchPrefix = `useFetch::${Math.random().toString(36).slice(2, 10)}`;

/**
 * @param {string} refetchKey
 */
export function triggerRefetch(refetchKey) {
  window.dispatchEvent(new Event(`${refetchPrefix}::${refetchKey}`));
}

/**
 * @template T
 * @param {string} urlOrKey If this param is a key, then the `urlMapPromise` must be provided.
 * @param {RequestInit} [fetchOpts]
 * @param {Object} [options]
 * @param {'json' | 'text' | 'blob' | 'arrayBuffer' | 'formData'} [options.responseType = 'json']
 * @param {Promise<{ [key: string]: string }>} [options.urlMapPromise]
 * @param {any[]} [options.deps] useEffect dependencies to trigger refetch
 * @param {boolean} [options.showGlobalLoader = true]
 * @param {boolean} [options.refetchable = false] Ability to trigger a refetch from anywhere in the
 * application using the triggerRefetch() method with the same value as the `urlOrKey` param.
 * @param {() => void} [options.onRefetchStart] This is to allow to integrate a custom loading UI
 * @param {(error?: unknown) => void} [options.onRefetchCompleted] This is to allow to integrate a custom loading UI
 * @returns {{
 *   data: T | null,
 *   setData: import('preact/hooks').Dispatch<import('preact/hooks').StateUpdater<T | null>>,
 *   error: unknown | undefined,
 *   loading: boolean,
 *   refetch: () => Promise<void>,
 *   getAbortController: () => AbortController|null
 * }}
 */
export default function useFetch(urlOrKey, fetchOpts = {}, options = {}) {
  const {
    responseType = 'json',
    urlMapPromise,
    deps = [],
    refetchable = false,
    onRefetchStart,
    onRefetchCompleted,
  } = options;
  const [data, setData] = useState(/** @type {T | null} */ (null));
  const [error, setError] = useState(/** @type {unknown} */ (undefined));
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef(/** @type {AbortController|null} */ (null));
  const refetch = useCallback(async () => {
    abortControllerRef.current?.abort?.();
    abortControllerRef.current = new AbortController();
    setLoading(true);
    onRefetchStart?.();
    try {
      let url = urlOrKey;
      if (urlMapPromise) {
        const urlMap = await urlMapPromise;
        url = urlMap[urlOrKey] || urlOrKey;
      }
      const response = await fetch(url, { ...fetchOpts, signal: abortControllerRef.current.signal });
      if (response.ok || response.status === 304) {
        const data = await response[responseType]();
        setData(data);
        setError(undefined);
        setLoading(false);
        onRefetchCompleted?.();
      } else {
        throw new Error('Network response was not ok');
      }
    } catch (error) {
      // @ts-ignore
      if (error?.name === 'AbortError') {
        onRefetchCompleted?.(error);
        return;
      }
      setError(error);
      setLoading(false);
      onRefetchCompleted?.(error);
    }
  }, [urlOrKey, onRefetchStart, onRefetchCompleted, responseType]);

  useEffect(() => {
    if (refetchable) {
      const key = `${refetchPrefix}::${urlOrKey}`;
      window.addEventListener(key, refetch);
      return () => window.removeEventListener(key, refetch);
    }
  }, [refetchable, urlOrKey, refetch]);

  // By default only refetch on mount, unless `deps` was provided
  useEffect(() => {
    refetch();
    return () => {
      abortControllerRef.current?.abort?.();
    };
  }, [urlOrKey].concat(deps));

  return {
    data,
    setData, // if you ever want to patch the data in-place
    error,
    loading,
    refetch,
    getAbortController: () => abortControllerRef.current,
  };
}
