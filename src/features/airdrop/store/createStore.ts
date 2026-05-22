/**
 * Tiny dependency-free store factory with a Zustand-compatible surface.
 *
 * Why not Zustand directly? Zustand is not a project dependency and this repo
 * has a deliberate "no new dependencies" constraint. React 19 ships
 * `useSyncExternalStore`, which is exactly the primitive Zustand uses under the
 * hood. This factory exposes the same `getState` / `setState` / `subscribe`
 * shape, so if the team later chooses to adopt Zustand the migration is a near
 * drop-in (swap `createStore` for `create`, keep selectors identical).
 */
import { useSyncExternalStore } from 'react';

export type StateUpdater<T> = Partial<T> | ((prev: T) => Partial<T>);

export interface Store<T> {
  getState: () => T;
  setState: (updater: StateUpdater<T>) => void;
  subscribe: (listener: () => void) => () => void;
  /** React hook: subscribe to a selected slice with referential stability. */
  use: <S>(selector: (state: T) => S) => S;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();

  const getState = () => state;

  const setState = (updater: StateUpdater<T>) => {
    const patch = typeof updater === 'function' ? updater(state) : updater;
    const next = { ...state, ...patch };
    // Shallow-equality short-circuit avoids needless re-renders.
    let changed = false;
    for (const key in patch) {
      if (next[key as keyof T] !== state[key as keyof T]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    state = next;
    listeners.forEach((l) => l());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  function use<S>(selector: (s: T) => S): S {
    return useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(state),
    );
  }

  return { getState, setState, subscribe, use };
}
