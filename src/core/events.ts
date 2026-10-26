import type { AppEvents, TypedEmitter } from './contracts';

type Handler = (payload: never) => void;

export function createEmitter<E>(): TypedEmitter<E> {
  const map = new Map<keyof E, Set<Handler>>();
  const emitter: TypedEmitter<E> = {
    on(type, fn) {
      let set = map.get(type);
      if (!set) map.set(type, (set = new Set()));
      set.add(fn as Handler);
      return () => emitter.off(type, fn);
    },
    off(type, fn) {
      map.get(type)?.delete(fn as Handler);
    },
    emit(type, ...payload) {
      const set = map.get(type);
      if (!set) return;
      // Set itera en orden de inserción y tolera borrados durante la iteración: sin copia por emisión.
      for (const fn of set) {
        try {
          (fn as (p: unknown) => void)(payload[0]);
        } catch (err) {
          console.error(`[events] error en manejador de "${String(type)}"`, err);
        }
      }
    },
  };
  return emitter;
}

export type AppEmitter = TypedEmitter<AppEvents>;
