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
 * Mark a specific migration as applied if not already tracked.
 */
function markMigrationAsApplied(migrationName) {
    // Ensure migrations table exists
    sqlite.exec(`
        CREATE TABLE IF NOT EXISTS __drizzle_migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hash TEXT NOT NULL,
            created_at INTEGER
        )
    `);

    const existing = sqlite.prepare(
        "SELECT id FROM __drizzle_migrations WHERE hash = ?"
    ).get(migrationName);

    if (!existing) {
        sqlite.prepare(
            "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)"
        ).run(migrationName, Date.now());
        console.log(`  Marked migration as applied: ${migrationName}`);
        return true;
    }
    return false;
}

/**
 * Apply any schema changes that might be missing from push-created databases.
 * Also marks the corresponding migrations as applied if schema already exists.
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

    // If landlords table exists (either we just created it or it existed before),
    // mark migration 0004 as applied so drizzle doesn't try to run it again
    const landlordsNowExists = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='landlords'"
    ).get();
    if (landlordsNowExists) {
        markMigrationAsApplied("0004_thin_ultimatum");
    }

    // Check and create expense_categories table if missing (from migration 0005)
    const expenseCategoriesExists = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_categories'"
    ).get();

    if (!expenseCategoriesExists) {
        console.log("Creating missing 'expense_categories' table...");
        sqlite.exec(`
            CREATE TABLE expense_categories (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                icon TEXT NOT NULL,
                color TEXT NOT NULL,
                track_allotments INTEGER DEFAULT 0,
                sort_order INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at INTEGER
            );
            CREATE UNIQUE INDEX expense_categories_name_unique ON expense_categories (name);
            CREATE UNIQUE INDEX expense_categories_slug_unique ON expense_categories (slug);
        `);
    }

    // Check and create expense_matching_rules table if missing
    const expenseMatchingRulesExists = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_matching_rules'"
    ).get();

    if (!expenseMatchingRulesExists) {
        console.log("Creating missing 'expense_matching_rules' table...");
        sqlite.exec(`
            CREATE TABLE expense_matching_rules (
                id TEXT PRIMARY KEY NOT NULL,
                category_id TEXT NOT NULL,
                name TEXT NOT NULL,
                priority INTEGER DEFAULT 100 NOT NULL,
                merchant_pattern TEXT,
                description_pattern TEXT,
                account_pattern TEXT,
                akahu_category TEXT,
                match_mode TEXT DEFAULT 'any',
                is_regex INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_at INTEGER,
                FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON UPDATE NO ACTION ON DELETE CASCADE
            )
        `);
    }

    // Check and create expense_transactions table if missing
    const expenseTransactionsExists = sqlite.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_transactions'"
    ).get();

    if (!expenseTransactionsExists) {
        console.log("Creating missing 'expense_transactions' table...");
        sqlite.exec(`
            CREATE TABLE expense_transactions (
                id TEXT PRIMARY KEY NOT NULL,
                transaction_id TEXT NOT NULL,
                category_id TEXT NOT NULL,
                matched_rule_id TEXT,
                match_confidence REAL,
                manual_match INTEGER DEFAULT 0,
                created_at INTEGER,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON UPDATE NO ACTION ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES expense_categories(id) ON UPDATE NO ACTION ON DELETE CASCADE,
                FOREIGN KEY (matched_rule_id) REFERENCES expense_matching_rules(id) ON UPDATE NO ACTION ON DELETE NO ACTION
            );
            CREATE UNIQUE INDEX expense_transactions_transaction_id_unique ON expense_transactions (transaction_id);
        `);
    }

    // Mark migration 0005 as applied if all expense tables exist
    const allExpenseTablesExist = sqlite.prepare(
        "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name IN ('expense_categories', 'expense_matching_rules', 'expense_transactions')"
    ).get();
    if (allExpenseTablesExist.count === 3) {
        markMigrationAsApplied("0005_elite_gideon");
    }
}

try {
    // First, handle push-created databases
    initializeMigrationsForPushDatabase();

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
