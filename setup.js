const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const db = new Database(path.join(__dirname, "campushub.db"));

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student','admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    scheduled_date TEXT DEFAULT '',
    scheduled_time TEXT DEFAULT '',
    expected_duration TEXT DEFAULT '',
    reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Support an existing database created by an older version.
const columns = db.prepare("PRAGMA table_info(users)").all().map(column => column.name);
if (!columns.includes("name")) db.exec("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''");
if (!columns.includes("email")) db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''");

const addUser = db.prepare(`
    INSERT OR IGNORE INTO users (name, username, email, password_hash, role)
    VALUES (?, ?, ?, ?, ?)
`);

addUser.run("CampusHub Admin", "admin", "admin@campushub.local", bcrypt.hashSync("admin123", 12), "admin");
addUser.run("Demo Student", "student", "student@campushub.local", bcrypt.hashSync("student123", 12), "student");

console.log("Database ready.");
console.log("Demo admin:   admin / admin123");
console.log("Demo student: student / student123");
console.log("Change these credentials before deploying publicly.");

db.close();
