# SafeLearn — Full-Stack Build (Assignment 2)

A 3-tier warehouse safety training platform for Team Novaris, built on top of the
Assignment 1 prototype: real backend, real database, hashed passwords, and a
polished client.

    Client Layer   -> public/            (HTML/CSS/JS, served by the Node server)
    Application    -> server/server.js   (REST API)
    Data Layer     -> server/data/safelearn.db  (SQLite, created on first run)

## Requirements

- **Node.js 22 or higher** — the server uses the built-in `node:sqlite` module
  which was introduced in Node 22. **Node 24 is installed on this machine** ✓

To verify: `node --version`   → should print `v22.x.x` or higher.

## Running the application

```
node server/server.js
```

Then open **http://localhost:3000** in a browser. That's it — one command, no
`npm install`, no separate frontend server, no network needed.

The SQLite database is created automatically at `server/data/safelearn.db` on
first run and seeded with demo accounts + sample incidents. To reset to a
completely fresh state, delete that file (and the `.db-shm` / `.db-wal`
companions) and restart the server.

## Why no `npm install`?

The server uses only Node.js built-in modules (`http`, `node:sqlite`, `crypto`) —
no Express, no ORM, no third-party packages. Nothing to install, nothing that can
fail to download on demo day, and no dependency version drift to explain.

## Demo accounts

| Role     | Email               | Password  |
|----------|----------------------|-----------|
| Employee | ram@novaris.com      | staff123  |
| Admin    | admin@novaris.com    | admin123  |

Other seeded employees (all start at 0 XP):
- sarah@novaris.com / staff123
- mike@novaris.com  / staff123
- emma@novaris.com  / staff123

New staff can self-register from the login screen ("New Staff" tab), and the
admin panel can create accounts directly ("Add staff").

## Training modules (4 core topics)

| Module ID | Title                                       | XP  |
|-----------|---------------------------------------------|-----|
| hazard    | Hazard Perception in the Warehouse          | 100 |
| manual    | Manual Handling & Ergonomic Safety          | 100 |
| unsafe    | Unsafe Acts & Near-Miss Reporting           | 150 |
| height    | Working at Height — Racking & Mezzanine     | 200 |

Quiz pass threshold: **80%** (4 out of 5 questions correct).

## What's real vs. what's a known simplification

**Real:**
- Passwords are hashed with `scrypt` (a random salt per user) — never stored or
  compared in plain text, and never sent back to the client.
- Every protected page calls `GET /api/auth/me` to verify the session token
  against the server before rendering anything — editing `localStorage` by hand
  can no longer fake a login (this *was* possible in the Assignment 1 build).
- XP, module completion, and incident reports are persisted in SQLite and survive
  a server restart or a different browser/device.
- XP amounts for every module/game are enforced **server-side** (`MODULE_XP` in
  `server.js`) — the client can display whatever it likes, but it cannot award
  itself more XP than the server allows.
- All user-submitted free text (incident descriptions, names) is escaped before
  being inserted into the page anywhere it's displayed, closing a stored-XSS gap
  that existed in the previous version.
- The Admin "Avg Knowledge Score" stat is computed live from real topic completion
  averages — it is not hardcoded.

**Known simplifications:**
- The session token is kept in `localStorage` and sent as a `Bearer` header.
  A production build would move this to an `httpOnly` cookie set by the server.
- There's no rate-limiting or account lockout on login.
- `node:sqlite` is still an experimental Node API (stable enough for this use,
  but worth a one-line caveat if asked in viva/Q&A).

## Project structure

```
SafeLearn/
├── server/
│   ├── server.js      REST API + static file server
│   ├── db.js           Schema + seed data
│   ├── auth.js         Password hashing + session tokens
│   └── data/           safelearn.db (created on first run)
└── public/
    ├── index.html       Login / registration
    ├── dashboard.html    Employee home
    ├── module.html       Slide-based training content
    ├── quiz.html         Knowledge check + XP award
    ├── game.html          Hazard Hunt / Safe-or-Unsafe / Beat the Clock / Scenario Simulator
    ├── challenge.html    Two-player quiz challenge
    ├── scene360.html     360°-style hazard scene
    ├── leaderboard.html   Org-wide XP leaderboard
    ├── report.html        Incident / near-miss reporting form
    ├── admin.html          H&S compliance + incident management hub
    ├── certificate.html    Printable certificate (keeps the Novaris company logo)
    ├── css/style.css
    ├── js/api.js         Fetch wrapper for the API
    ├── js/app.js         Shared client logic (auth, modules, utilities)
    └── images/            SafeLearn app logo/icon + Novaris company logo
```

## Mobile support

The client is responsive and works in phone browsers as well as desktop.

- Every page has `<meta name="viewport" ...>` so phones render at real device width.
- `public/css/mobile.css` (loaded last on every page except the printable certificate) holds all phone/touch overrides; desktop layout is unchanged.
- `public/js/mobile.js` turns the navbar into a hamburger menu on screens under 768px.
- *Safe or Unsafe?* game works by drag-and-drop **or** tap a card, then tap SAFE / UNSAFE (touch screens don't support HTML5 drag events).
- To test from a phone on the same Wi-Fi: run the server and open `http://<your-PC-IP>:3000`.
