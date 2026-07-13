declare module "pg" {
  export interface QueryResult<
    TRow extends Record<string, unknown> = Record<string, unknown>,
  > {
    readonly rows: readonly TRow[];
    readonly rowCount: number | null;
  }

  export interface PoolClient {
    readonly query: <
      TRow extends Record<string, unknown> = Record<string, unknown>,
    >(
      sql: string,
      params?: readonly unknown[],
    ) => Promise<QueryResult<TRow>>;
    readonly release: () => void;
  }

  export class Pool {
    constructor(config: {
      readonly connectionString: string;
      readonly ssl?: boolean | { readonly rejectUnauthorized: boolean };
    });

    readonly query: <
      TRow extends Record<string, unknown> = Record<string, unknown>,
    >(
      sql: string,
      params?: readonly unknown[],
    ) => Promise<QueryResult<TRow>>;
    readonly connect: () => Promise<PoolClient>;
    readonly end: () => Promise<void>;
  }
}
