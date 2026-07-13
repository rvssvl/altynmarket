import type { RealtimeEvent } from "@altyn-market/domain";

export interface RealtimeBus {
  readonly publish: (event: RealtimeEvent) => Promise<void>;
  readonly subscribe: (handler: (event: RealtimeEvent) => void) => () => void;
}

export const createInMemoryRealtimeBus = (): RealtimeBus => {
  const handlers = new Set<(event: RealtimeEvent) => void>();

  return {
    publish: async (event) => {
      for (const handler of handlers) {
        handler(event);
      }
    },
    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
};
