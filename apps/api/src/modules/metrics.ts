import type { MvpMetrics } from "@altyn-market/domain";

export interface MetricsService {
  readonly getMvpMetrics: () => Promise<MvpMetrics>;
}
