import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { dirname } from "path";

const dbPath = process.env.SQLITE_DB_PATH || "./data/sqlite.db";

// Ensure directory exists
const dir = dirname(dbPath);
if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
}

console.log(`Running migrations on database: ${dbPath}`);

const sqlite = new Database(dbPath);
const db = drizzle(sqlite);

/**
 * Check if the migrations table exists and if schema was created with push.
 * If so, mark all existing migrations as applied.
 */
function initializeMigrationsForPushDatabase() {
    // Check if __drizzle_migrations table exists
    const migrationsTableExists = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
    ).get();

    if (migrationsTableExists) {
        return false; // Table exists, let normal migration run
    }

    // Check if any of our app tables exist (indicating push was used)
    const usersTableExists = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).get();

    if (!usersTableExists) {
        return false; // Fresh database, let normal migration run
    }

    console.log("Database was created with 'drizzle-kit push' - initializing migration tracking...");

    // Create the migrations table
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL,
            created_at INTEGER
        )
    `);

    // Get all migration files and mark them as applied
    const migrationsFolder = "./drizzle";
    const migrationFiles = readdirSync(migrationsFolder)
        .filter(f => f.endsWith(".sql"))
        .sort();

    const insertStmt = sqlite.prepare(
        "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
    );

    for (const file of migrationFiles) {
        // Drizzle uses the filename (without .sql) as the hash
        const hash = file.replace(".sql", "");
        insertStmt.run(hash, Date.now());
        console.log(`  Marked as applied: ${file}`);
    }

    console.log("Migration tracking initialized.");
    return true;
}

/**
 * Apply any schema changes that might be missing from push-created databases.
 */
function applyMissingSchemaChanges() {
    // Check and add landlords table if missing
    const landlordsExists = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='landlords'"
    ).get();

    if (!landlordsExists) {
        console.log("Creating missing 'landlords' table...");
        sqlite.exec(`
            CREATE TABLE landlords (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                bank_account_pattern TEXT,
                matching_name TEXT,
                created_at INTEGER,
                updated_at INTEGER
            )
        `);
    }

    // Check and add matched_landlord_id column if missing
    const txColumns = sqlite.prepare("PRAGMA table_info(transactions)").all();
    const hasMatchedLandlordId = txColumns.some(col => col.name === "matched_landlord_id");

    if (!hasMatchedLandlordId) {
        console.log("Adding missing 'matched_landlord_id' column to transactions...");
        sqlite.exec("ALTER TABLE transactions ADD COLUMN matched_landlord_id TEXT");
    }

    // Check and add manual_match column if missing
    const hasManualMatch = txColumns.some(col => col.name === "manual_match");

    if (!hasManualMatch) {
        console.log("Adding missing 'manual_match' column to transactions...");
        sqlite.exec("ALTER TABLE transactions ADD COLUMN manual_match INTEGER DEFAULT 0");
    }
}

try {
    // First, handle push-created databases
    const wasInitialized = initializeMigrationsForPushDatabase();

    // Apply any missing schema changes for push databases
    applyMissingSchemaChanges();

    // Now run migrations normally
    migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations complete!");
} catch (error) {
    // Check if this is a schema mismatch error
    if (error.cause?.code === "SQLITE_ERROR") {
        console.warn("Migration failed with SQLite error:", error.cause?.message || error.message);
        console.warn("The application will attempt to start anyway.");
    } else {
        console.error("Migration failed:", error.message);
        throw error;
    }
} finally {
    sqlite.close();
}
