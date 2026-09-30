const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, "campushub.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','review','scheduled','progress','resolved')),
    scheduled_date TEXT DEFAULT '',
    scheduled_time TEXT DEFAULT '',
    expected_duration TEXT DEFAULT '',
    reported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
`);

// Keep existing databases compatible with the registration fields.
const userColumns = db.prepare("PRAGMA table_info(users)").all().map(column => column.name);
if (!userColumns.includes("name")) db.exec("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''");
if (!userColumns.includes("email")) db.exec("ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ''");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || "CHANGE_THIS_CAMPUSHUB_SESSION_SECRET",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 8
    }
}));

app.use(express.static(__dirname));

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: "You must be logged in." });
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== "admin") {
        return res.status(403).json({ error: "Admin access required." });
    }
    next();
}

/* ---------- AUTH ---------- */

app.post("/api/auth/register", async (req, res) => {
    const { name, username, email, password } = req.body;

    if (!name || !username || !email || !password) {
        return res.status(400).json({ error: "All registration fields are required." });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters." });
    }

    const cleanName = name.trim();
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanUsername.length < 3) {
        return res.status(400).json({ error: "Username must be at least 3 characters." });
    }

    const existingUsername = db.prepare(
        "SELECT id FROM users WHERE username = ?"
    ).get(cleanUsername);

    if (existingUsername) {
        return res.status(409).json({ error: "This username is already registered." });
    }

    const existingEmail = db.prepare(
        "SELECT id FROM users WHERE email = ? COLLATE NOCASE"
    ).get(cleanEmail);

    if (existingEmail) {
        return res.status(409).json({ error: "This email is already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    try {
        db.prepare(`
            INSERT INTO users (name, username, email, password_hash, role)
            VALUES (?, ?, ?, ?, 'student')
        `).run(cleanName, cleanUsername, cleanEmail, passwordHash);
    } catch (error) {
        if (String(error.message).includes("UNIQUE")) {
            return res.status(409).json({ error: "This username is already registered." });
        }
        console.error(error);
        return res.status(500).json({ error: "Could not create the account." });
    }

    res.status(201).json({ message: "Account created successfully." });
});

app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required." });
    }

    const user = db.prepare(
        "SELECT id, username, password_hash, role FROM users WHERE username = ?"
    ).get(username.trim());

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.status(401).json({ error: "Invalid username or password." });
    }

    req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
    };

    res.json({
        message: "Login successful.",
        user: req.session.user
    });
});

app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({ message: "Logged out." });
    });
});

app.get("/api/auth/me", (req, res) => {
    res.json({ user: req.session.user || null });
});

/* ---------- ISSUES ---------- */

app.get("/api/issues", (req, res) => {
    const issues = db.prepare(`
        SELECT
            id,
            title,
            category,
            location,
            description,
            status,
            scheduled_date AS scheduledDate,
            scheduled_time AS scheduledTime,
            expected_duration AS expectedDuration,
            reported_at AS reportedAt,
            updated_at AS updatedAt
        FROM issues
        ORDER BY id DESC
    `).all();

    res.json(issues);
});

app.post("/api/issues", requireLogin, (req, res) => {
    const { title, category, location, description } = req.body;

    if (!title || !category || !location || !description) {
        return res.status(400).json({ error: "All issue fields are required." });
    }

    const now = new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO issues
        (user_id, title, category, location, description, status, reported_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
        req.session.user.id,
        title.trim(),
        category.trim(),
        location.trim(),
        description.trim(),
        now,
        now
    );

    res.status(201).json({
        message: "Issue reported successfully.",
        id: String(result.lastInsertRowid).padStart(3, "0")
    });
});

app.patch("/api/issues/:id", requireAdmin, (req, res) => {
    const { status, scheduledDate = "", scheduledTime = "", expectedDuration = "" } = req.body;

    const allowed = ["pending", "review", "scheduled", "progress", "resolved"];

    if (!allowed.includes(status)) {
        return res.status(400).json({ error: "Invalid status." });
    }

    const result = db.prepare(`
        UPDATE issues
        SET status = ?,
            scheduled_date = ?,
            scheduled_time = ?,
            expected_duration = ?,
            updated_at = ?
        WHERE id = ?
    `).run(
        status,
        scheduledDate,
        scheduledTime,
        expectedDuration,
        new Date().toISOString(),
        Number(req.params.id)
    );

    if (!result.changes) {
        return res.status(404).json({ error: "Issue not found." });
    }

    res.json({ message: "Issue updated." });
});

/* ---------- STATS ---------- */

app.get("/api/stats", (req, res) => {
    const rows = db.prepare(`
        SELECT status, COUNT(*) AS count
        FROM issues
        GROUP BY status
    `).all();

    const stats = {
        total: 0,
        pending: 0,
        review: 0,
        scheduled: 0,
        progress: 0,
        resolved: 0
    };

    for (const row of rows) {
        stats[row.status] = row.count;
        stats.total += row.count;
    }

    res.json(stats);
});

/* ---------- START ---------- */

app.listen(PORT, () => {
    console.log(`CampusHub running at http://localhost:${PORT}`);
});
