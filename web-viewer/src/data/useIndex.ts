import { useEffect, useState } from 'react';
import type { IndexFile } from '../types';

type State =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: IndexFile; error: null }
  | { status: 'error'; data: null; error: Error };

let cache: IndexFile | null = null;
let inflight: Promise<IndexFile> | null = null;

async function load(): Promise<IndexFile> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch(`${import.meta.env.BASE_URL}index.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`index.json HTTP ${r.status} — run "npm run build-index" first`);
      return r.json() as Promise<IndexFile>;
    })
    .then((json) => {
      cache = json;
      inflight = null;
      return json;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });
  return inflight;
}

export function useIndex(): State {
  const [state, setState] = useState<State>(() =>
    cache
      ? { status: 'ready', data: cache, error: null }
      : { status: 'loading', data: null, error: null },
  );

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data, error: null });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ status: 'error', data: null, error });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
