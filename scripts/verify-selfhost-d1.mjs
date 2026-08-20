import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const database = process.env.OPENSEO_SELFHOST_D1_NAME ?? "open-seo-db-selfhost";
const mode = process.argv[2] ?? "integrity";
const allowedNonemptyDrops = new Set(
  (process.env.OPENSEO_ALLOWED_NONEMPTY_DROPS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

function execute(sql) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      database,
      "--remote",
      "--command",
      sql,
      "--json",
    ],
    { encoding: "utf8", env: process.env },
  );

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error(`D1 command failed for ${database}`);
  }

  const payload = JSON.parse(result.stdout);
  if (!Array.isArray(payload) || payload.some((entry) => !entry.success)) {
    throw new Error(`D1 returned an unsuccessful result for ${database}`);
  }
  return payload;
}

function verifyIntegrity() {
  const [quickCheck, foreignKeys] = execute(
    "PRAGMA quick_check; PRAGMA foreign_key_check;",
  );
  const quickCheckOk =
    quickCheck.results.length === 1 &&
    quickCheck.results[0].quick_check === "ok";
  if (!quickCheckOk) throw new Error("D1 quick_check did not return ok");
  if (foreignKeys.results.length !== 0) {
    throw new Error("D1 foreign_key_check found violations");
  }
  console.log(`D1 integrity verified for ${database}`);
}

function verifyPendingDrops() {
  const [ledger] = execute("SELECT name FROM d1_migrations ORDER BY id;");
  const applied = new Set(ledger.results.map((row) => row.name));
  const [schema] = execute(
    "SELECT name FROM sqlite_schema WHERE type = 'table';",
  );
  const existingTables = new Set(schema.results.map((row) => row.name));
  const migrations = readdirSync("drizzle")
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  for (const name of applied) {
    if (!migrations.includes(name)) {
      throw new Error(`Applied migration is missing locally: ${name}`);
    }
  }

  const pending = migrations.filter((name) => !applied.has(name));
  for (const name of pending) {
    const sql = readFileSync(`drizzle/${name}`, "utf8");
    const matches = sql.matchAll(
      /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"]?([A-Za-z_][A-Za-z0-9_]*)[`"]?/gi,
    );
    for (const match of matches) {
      const table = match[1];
      // A migration may create and drop a temporary table in one transaction.
      // Only pre-existing tables can contain data from the current release.
      if (!existingTables.has(table)) continue;
      const [count] = execute(`SELECT COUNT(*) AS row_count FROM "${table}";`);
      const rowCount = Number(count.results[0]?.row_count ?? 0);
      if (rowCount > 0 && !allowedNonemptyDrops.has(table)) {
        throw new Error(
          `${name} would drop non-empty table ${table} (${rowCount} rows)`,
        );
      }
      console.log(`${name}: DROP TABLE ${table} accepted (${rowCount} rows)`);
    }
  }
  console.log(
    `Pending migration drops verified (${pending.length} migrations)`,
  );
}

if (mode === "integrity") {
  verifyIntegrity();
} else if (mode === "predeploy") {
  verifyIntegrity();
  verifyPendingDrops();
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
