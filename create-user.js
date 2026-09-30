const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const path = require("path");

const [username, password, role = "student", name = username, email = `${username}@campushub.local`] = process.argv.slice(2);

if (!username || !password || !["student", "admin"].includes(role)) {
    console.log("Usage: node create-user.js <username> <password> [student|admin] [name] [email]");
    process.exit(1);
}

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
`);

try {
    db.prepare(`
        INSERT INTO users (name, username, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?)
    `).run(name.trim(), username.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 12), role);

    console.log(`Created ${role} account: ${username}`);
} catch (error) {
    if (String(error.message).includes("UNIQUE")) {
        console.error("That username already exists.");
    } else {
        console.error(error.message);
    }
    process.exitCode = 1;
}

db.close();
