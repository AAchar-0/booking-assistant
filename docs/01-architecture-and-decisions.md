# Architecture and Decisions

## Layers (each knows only about the one below)

| Layer | Files | Job |
|---|---|---|
| HTTP shell | `src/app.js`, `src/server.js` | Express: headers, CORS, JSON, login check, errors |
| Routes | `src/routes.js` | The list of endpoints as data; handlers are plain functions |
| Rules | `src/domain/*` | Availability calculation, booking, cancelling, statistics |
| Assistant | `src/ai/*` | Tool loop, tool definitions, API client |
| Storage | `src/repo/*`, `db/migrations` | Same methods in memory and in PostgreSQL |

Why this shape: the rules never mention HTTP or SQL, so they are tested in milliseconds with an in-memory repository, and the same rules serve both the website and the AI assistant.

## Decisions

| # | Decision | Reason | Cost of the choice |
|---|---|---|---|
| 1 | The database prevents double booking (exclusion constraint) | Application checks alone can be raced by two requests at once | Needs PostgreSQL and the btree_gist extension |
| 2 | Store UTC, convert for display with Intl | Daylight saving and travelling users cannot corrupt data | Opening hours are converted per date |
| 3 | Money as whole cents | Decimals give rounding errors | Display code divides by 100 |
| 4 | Assistant tools are read or propose only | A tricked model still cannot act | One extra click for the customer (a feature: a human confirms) |
| 5 | Server rebuilds the conversation from plain text | The browser could forge roles or tool results | No long-term memory in the assistant |
| 6 | scrypt from Node's crypto, no extra library | Strong, built in, nothing to patch | Slightly more code |
| 7 | Signed token (JWT format) in a header | Works across github.io and onrender.com, where cookies are blocked | Stored in localStorage: safe only because the app never inserts untrusted HTML |
| 8 | User row loaded on every request | Role changes and deleted users take effect at once | One query per request |
| 9 | Hash routing (`#/book`) | GitHub Pages serves static files only | Less pretty addresses |
| 10 | In-memory repository mode | Runs with `npm start` before any database exists; fast tests | Data lost on restart (the page says so) |
| 11 | Handlers as data (`routes.js`) | Easy to test and to document | One level of indirection |
| 12 | Rate limiter in memory | Enough for one instance | Needs Redis if you run several instances |
| 13 | Only Express and pg as runtime dependencies | Small attack surface | More hand-written helpers |

## Data model

```text
users 1---* bookings *---1 services
                |
                *---1 staff *---* services   (staff_services)
                       |
                       *--- staff_hours (weekday, start, end in business local time)
```

Statuses: CONFIRMED and COMPLETED occupy the calendar; CANCELLED and NO_SHOW free it.

## Booking flow (what happens on POST /api/bookings)

1. Validate the input shape.
2. Load the service; load that day's staff, hours and bookings.
3. Recompute the free slots and require the requested start to be among them.
4. Order the free staff by load; apply the customer rules (limit, no self-overlap).
5. Try to insert; if PostgreSQL reports an overlap (someone was faster), try the next staff member; if none is left, answer 409.
