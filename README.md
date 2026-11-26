# Booking Assistant

> An appointment booking system for a small service business: customers see real free times and book online, the database makes double booking impossible, and an AI assistant can find a time for you but can only **propose**: a human presses Confirm.

**LIVE-APP:** [booking-assistant](PASTE-LIVE-URL-HERE) (first load can take up to a minute: free hosting sleeps when idle)
**Source code:** [github.com/AAchar-0/booking-assistant](https://github.com/AAchar-0/booking-assistant)
**Author:** [Anade Acharo](https://aachar-0.github.io/)

> Demo project. The business ("Acacia Studio"), staff, prices and bookings are invented. Nothing is charged and no real appointment is made.

## Contents

- [Overview](#overview)
- [Key features](#key-features)
- [How it works](#how-it-works)
- [The AI assistant](#the-ai-assistant)
- [Run it locally](#run-it-locally)
- [Testing](#testing)
- [Deployment](#deployment)
- [API summary](#api-summary)
- [Settings](#settings)
- [Project structure](#project-structure)
- [Limitations and roadmap](#limitations-and-roadmap)
- [Security and privacy](#security-and-privacy)
- [Documentation](#documentation)
- [License](#license)

## Overview

Phone-tag and double bookings cost small businesses customers. This project is the booking core such a business needs: services, staff with opening hours, an availability engine, accounts, cancellation rules, an admin area, and an assistant for customers who would rather type "Friday afternoon, an hour" than click through a calendar.

It is built as a real system, not a mock-up: PostgreSQL schema with constraints, tested business rules, rate limiting, input validation, CI that runs the tests against a real PostgreSQL, and a written [project plan](docs/00-project-plan.md).

## Key features

**Booking that cannot double-book**
- A PostgreSQL exclusion constraint on (staff member, time range) refuses overlapping bookings even when two requests arrive at the same instant. A test fires 8 simultaneous inserts and checks that exactly one wins.
- Availability is calculated from weekly hours per staff member in the business's time zone, minus existing bookings, on a 15-minute grid, with a minimum notice period and a 60-day horizon.
- Times are stored in UTC and converted for display. Daylight saving is covered by tests (London, New York) even though the demo business is in Nairobi.

**Customer rules that match real life**
- Least-busy qualified staff member is assigned automatically; a customer cannot overlap their own bookings or hold more than 5 upcoming ones.
- Cancelling is allowed until 2 hours before the start; the time becomes free again.

**Admin area**
- Bookings by date and status, mark completed or no-show, cancel; add, hide and show services; 30-day summary by status and by service.

**AI assistant with a safety design**
- Read tools (services, availability, your bookings) and propose tools (booking, cancellation). **No tool changes data.**
- Proposals appear as cards; the booking exists only after the customer presses Confirm, which calls the same checked endpoint as the booking page.
- Daily and per-user caps, short answers and a call limit keep the cost bounded. Without an API key the assistant is simply switched off.

**Operations**
- Access log in a fixed format (client address hidden, query strings removed) that the companion [Log Analyzer](https://github.com/AAchar-0/log-analyzer) can read.
- Health endpoint, clean JSON errors with stable codes, graceful shutdown, Docker image, migrations that run at start.

## How it works

```text
Browser (React on GitHub Pages) --JSON over HTTPS--> Express API (Render) --SQL--> PostgreSQL
                                                          |--> access log lines (for the Log Analyzer)
                                                          '--> Anthropic API (assistant: read and propose tools only)
```

Booking a time (what the server does):
1. Validate the input.
2. Load the service, that day's staff, hours and bookings.
3. Recompute free times and require the requested one to be among them.
4. Order free staff by load; check the customer's rules.
5. Insert; if PostgreSQL reports an overlap (someone was faster), try the next staff member; otherwise answer 409 "just taken".

Why it is built this way: [docs/01-architecture-and-decisions.md](docs/01-architecture-and-decisions.md).

## The AI assistant

```text
customer text -> server -> model --asks--> tools (read or propose) --> model --> reply + proposal cards
                                                                                  |
                                       customer presses Confirm -> POST /api/bookings (full checks)
```

Controls (each has a test): the model cannot book; the server rebuilds the conversation from plain text (20 turns, 1000 characters each) so the browser cannot forge roles; 6 model calls and 700 tokens at most per question; daily and hourly caps; tool data is treated as data, never as instructions. Details: [docs/03-ai-assistant-design.md](docs/03-ai-assistant-design.md).

## Run it locally

Needs Node.js 22 LTS. No database is needed for a first try: without `DATABASE_URL` the API runs in an in-memory demo mode.

```powershell
# terminal 1
cd backend
npm install
npm start

# terminal 2
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

**Admin account in demo mode:** stop the backend and start it again with an admin email and password set (PowerShell):

```powershell
$env:ADMIN_EMAIL = "you@example.com"
$env:ADMIN_PASSWORD = "a long password of your choice"
npm start
```

Log in on the website with those details and an **Admin** link appears.

**With PostgreSQL:** set `DATABASE_URL` (see [Settings](#settings)), then run `npm run migrate` to create the tables and `npm run seed` to add the demo business and the admin account. `docker compose up -d db` starts a local PostgreSQL if you have Docker.

## Testing

```powershell
cd backend ; npm test      # business rules, security helpers, assistant, HTTP end to end, repository contract
cd frontend ; npm test     # formatting and routing helpers
```

- The **repository contract** tests run against the in-memory repository always, and against PostgreSQL when `DATABASE_URL` points at a migrated database (CI does this with a PostgreSQL service container). They include the simultaneous-booking race.
- The **assistant** tests use a scripted fake model: fast, free and repeatable. They prove the plumbing and the safety rules, not the model's wording. See docs/03 for how to evaluate quality by hand.
- **HTTP** tests start the real Express app on a random port and drive it with `fetch`: registration, login limits, the booking journey, permissions, CORS, headers, log format.

## Deployment

API on Render (Docker, free plan), database on a free PostgreSQL provider, website on GitHub Pages through GitHub Actions.

1. **Database:** create a free PostgreSQL database, then run `npm run migrate` and `npm run seed` against it from `backend/` with `DATABASE_URL` set.
2. **API on Render:** new Web Service from this repository, language Docker, root directory `backend`, health check path `/api/health`. Environment variables: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (32+ random characters) and `ALLOWED_ORIGIN=https://aachar-0.github.io`. An AI key is optional and switches the assistant on (see the settings table: Anthropic, or Groq's free plan).
3. **Website on GitHub Pages:** in the repository settings choose Pages > Source > GitHub Actions, and add a repository variable `API_URL` with the Render address (no trailing slash). The `Deploy website` workflow then publishes the site on every change under `frontend/`.

## API summary

| Area | Endpoints |
|---|---|
| Public | `GET /api/health`, `/config`, `/services`, `/availability?serviceId=&date=` |
| Accounts | `POST /api/auth/register`, `/auth/login`, `GET /api/me` |
| Customer | `POST /api/bookings`, `GET /api/bookings/mine`, `POST /api/bookings/:id/cancel`, `POST /api/assistant/chat` |
| Admin | `GET /api/admin/bookings`, `PATCH /api/admin/bookings/:id`, `GET/POST/PATCH /api/admin/services`, `GET /api/admin/stats` |

Full reference with error codes: [docs/02-api-reference.md](docs/02-api-reference.md).

## Settings

Environment variables for the backend (all optional in development). A template without values is in [`backend/.env.example`](backend/.env.example).

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | none (demo mode) | PostgreSQL connection string |
| `JWT_SECRET` | dev value | **Required in production**: 32+ random characters |
| `ALLOWED_ORIGIN` | none | The one website allowed to call the API from a browser |
| `AI_PROVIDER` | `anthropic` | Which AI service: `anthropic`, `groq` (free plan available) or `openai-compatible` |
| `ANTHROPIC_API_KEY` | none (assistant off) | Key for the `anthropic` provider |
| `AI_API_KEY` | none (assistant off) | Key for `groq` or `openai-compatible` |
| `AI_BASE_URL` | set by `groq` | Only for `openai-compatible`: the service's `https://` address |
| `AI_MODEL` | `claude-haiku-5-5` (`anthropic`), `llama-3.3-70b-versatile` (`groq`) | Model used by the assistant; required for `openai-compatible` |
| `AI_REASONING_EFFORT` | empty | Optional `low`, `medium` or `high`, for models that support it |

The assistant's safety rules live in this project's code, not in the AI service, so they are the same whichever provider is used. Keys are set only as environment variables on the host, never in the repository. What a visitor types into the assistant is sent to the chosen AI provider, so the demo tells visitors not to type personal details.
| `AI_DAILY_LIMIT`, `AI_USER_HOURLY_LIMIT` | 200, 20 | Cost caps |
| `BUSINESS_NAME`, `BUSINESS_TZ` | Acacia Studio (demo), Africa/Nairobi | Business identity and time zone |
| `SLOT_STEP_MINUTES`, `MIN_NOTICE_MINUTES`, `MAX_DAYS_AHEAD`, `CANCEL_MIN_HOURS`, `MAX_ACTIVE_BOOKINGS` | 15, 60, 60, 2, 5 | Booking rules |
| `LOG_CLIENT_IP` | false | Include client addresses in the access log |

Website build variables: `VITE_API_URL`, `VITE_BASE`, `VITE_PORTFOLIO_URL`, `VITE_SOURCE_URL` (public values only; see `frontend/.env.example`).

## Project structure

```text
backend/
  src/app.js, server.js, routes.js, config.js
  src/domain/      availability engine, booking rules
  src/ai/          assistant loop, tools, API client
  src/repo/        memory and PostgreSQL repositories (same contract)
  src/auth/        passwords (scrypt), tokens, rate limiter
  src/http/        validation, errors, access log
  db/migrations/   SQL schema
  scripts/         migrate, seed
  test/, testkit/  tests and shared test helpers
frontend/src/      React app: pages, assistant panel, API client
docs/              plan, architecture, API, assistant, security, guides, reference sheets, JavaScript tour
.github/workflows/ CI (with PostgreSQL) and Pages deployment
```

## Limitations and roadmap

- Staff hours and the staff list are edited in the database (no admin screen yet).
- No payments, email or SMS reminders, email verification or password reset yet. Planned: M-Pesa payment before confirmation, reminders.
- One business per deployment; rate limits are per server instance.
- The free hosting plans sleep when idle and have usage limits; the website tells visitors when the server is waking up.
- Not security audited. See [docs/04](docs/04-security-and-privacy.md) for the threat list and honest limits.

## Security and privacy

Passwords are hashed with scrypt, logins are rate limited, tokens are signed and short-lived, every input is validated, SQL uses placeholders only, CORS allows one origin, and the access log hides client addresses. The demo collects only name, email, booking times and an optional short note, and the assistant never sees notes. Details and legal pointers: [docs/04-security-and-privacy.md](docs/04-security-and-privacy.md).

## Documentation

| File | Content |
|---|---|
| [docs/00-project-plan.md](docs/00-project-plan.md) | Problem, goals, requirements, phases, risks |
| [docs/01-architecture-and-decisions.md](docs/01-architecture-and-decisions.md) | Layers, decisions and trade-offs, data model |
| [docs/02-api-reference.md](docs/02-api-reference.md) | Endpoints and error codes |
| [docs/03-ai-assistant-design.md](docs/03-ai-assistant-design.md) | Tools, controls, evaluation, cost |
| [docs/04-security-and-privacy.md](docs/04-security-and-privacy.md) | Threats, defences, personal data |
| [docs/06-javascript-and-react-reference-sheet.md](docs/06-javascript-and-react-reference-sheet.md) | JavaScript, Node, Express, React, SQL quick reference |
| [docs/javascript-tour.mjs](docs/javascript-tour.mjs) | Runnable JavaScript refresher (`node docs/javascript-tour.mjs`) |
| [docs/07-connect-log-analyzer-and-inventory-api.md](docs/07-connect-log-analyzer-and-inventory-api.md) | Next step: analysing this API's log, stock integration |

## License

[MIT](LICENSE). Copyright (c) 2026 Anade Acharo.
