import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync } from "fs";
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

try {
    migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations complete!");
} catch (error) {
    // Check if this is a schema mismatch error (db was created with push, not migrations)
    if (error.cause?.code === "SQLITE_ERROR") {
        console.warn("Migration failed - database may have been created with 'drizzle-kit push'");
        console.warn("If this is a fresh deployment, delete the database file and restart.");
        console.warn("Error:", error.cause?.message || error.message);
        // Don't exit with error - let the app try to start anyway
        // The schema might already be correct from a previous push
    } else {
        throw error;
    }
} finally {
    sqlite.close();
}
