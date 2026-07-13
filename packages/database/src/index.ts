export interface DatabaseConfig {
  readonly databaseUrl: string;
  readonly ssl?: boolean;
}

export interface Migration {
  readonly id: string;
  readonly description: string;
  readonly sql: string;
}

export interface DatabaseClient {
  readonly query: <
    TRow extends Record<string, unknown> = Record<string, unknown>,
  >(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<readonly TRow[]>;
  readonly transaction: <T>(
    work: (client: DatabaseExecutor) => Promise<T>,
  ) => Promise<T>;
  readonly close: () => Promise<void>;
}

export interface DatabaseExecutor {
  readonly query: <
    TRow extends Record<string, unknown> = Record<string, unknown>,
  >(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<readonly TRow[]>;
}

export const databasePackageReady = true;

export const createPostgresDatabase = async (
  config: DatabaseConfig,
): Promise<DatabaseClient> => {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for PostgreSQL runtime.");
  }

  const pg = (await import("pg")) as {
    readonly Pool: new (config: {
      readonly connectionString: string;
      readonly ssl?: boolean | { readonly rejectUnauthorized: boolean };
    }) => PgPool;
  };
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    ...(config.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  return {
    query: async <
      TRow extends Record<string, unknown> = Record<string, unknown>,
    >(
      sql: string,
      params?: readonly unknown[],
    ) => {
      const result = await pool.query<TRow>(sql, params);
      return result.rows;
    },
    transaction: async (work) => {
      const client = await pool.connect();

      try {
        await client.query("begin");
        const result = await work({
          query: async <
            TRow extends Record<string, unknown> = Record<string, unknown>,
          >(
            sql: string,
            params?: readonly unknown[],
          ) => {
            const queryResult = await client.query<TRow>(sql, params);
            return queryResult.rows;
          },
        });
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
};

export const runMigrations = async (
  database: DatabaseClient,
  migrations: readonly Migration[],
): Promise<void> => {
  await database.query(`
    create table if not exists schema_migrations (
      id text primary key,
      description text not null,
      applied_at timestamptz not null default now()
    )
  `);

  for (const migration of migrations) {
    const existing = await database.query<{ readonly id: string }>(
      "select id from schema_migrations where id = $1",
      [migration.id],
    );

    if (existing.length > 0) {
      continue;
    }

    await database.transaction(async (client) => {
      await client.query(migration.sql);
      await client.query(
        "insert into schema_migrations (id, description) values ($1, $2)",
        [migration.id, migration.description],
      );
    });
  }
};

interface PgPool {
  readonly query: <
    TRow extends Record<string, unknown> = Record<string, unknown>,
  >(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ readonly rows: readonly TRow[] }>;
  readonly connect: () => Promise<PgPoolClient>;
  readonly end: () => Promise<void>;
}

interface PgPoolClient {
  readonly query: <
    TRow extends Record<string, unknown> = Record<string, unknown>,
  >(
    sql: string,
    params?: readonly unknown[],
  ) => Promise<{ readonly rows: readonly TRow[] }>;
  readonly release: () => void;
}

export { migrations } from "./migrations.js";
