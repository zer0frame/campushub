# CampusHub — Database Version

CampusHub now uses a real server-side SQLite database instead of `localStorage` for accounts and complaints.

## Stack

- Node.js
- Express
- SQLite (`better-sqlite3`)
- bcrypt password hashing
- Express sessions
- Existing HTML/CSS frontend

## 1. Install Node.js

Install Node.js 20+.

## 2. Install dependencies

Open a terminal inside this folder:

```bash
npm install
```

## 3. Create the database

Run:

```bash
npm run setup
```

This creates `campushub.db` and two demo accounts:

- Student: `student` / `student123`
- Admin: `admin` / `admin123`

Change/remove these before putting the site online.

## 4. Start CampusHub

```bash
npm start
```

Open:

```text
http://localhost:3000
```

Do **not** open the HTML files directly with `file://`. The pages need the Express server for `/api/...` requests.

## 5. Create real users

After setup, you can create accounts from the terminal:

```bash
npm run create-user -- alice MyStrongPassword123 student
```

or an admin:

```bash
npm run create-user -- maintenance MyStrongPassword123 admin
```

## Database structure

### users

Stores:

- username
- bcrypt password hash
- role (`student` or `admin`)
- creation time

Passwords are never stored as plain text.

### issues

Stores:

- issue number
- student who reported it
- title
- category
- location
- description
- status
- scheduled date/time
- expected duration
- reported/updated timestamps

## Important

The current Express session store is suitable for a local/demo project. For a real public deployment, use a persistent session store and a production PostgreSQL/MySQL database rather than relying on SQLite and the default in-memory session store.

The frontend no longer trusts JavaScript/localStorage for authentication. The server checks the logged-in session and role for protected actions.
