import { createPostgresDatabase, migrations, runMigrations } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const database = await createPostgresDatabase({
  databaseUrl,
  ssl: process.env.DATABASE_SSL === "1",
});

try {
  await runMigrations(database, migrations);
  console.log(`Applied ${migrations.length} migrations.`);
} finally {
  await database.close();
}
