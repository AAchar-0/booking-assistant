# Project Plan: Booking Assistant

**Owner:** Anade Acharo. **Type:** portfolio project built to production standards. **Stack:** Node.js 22, Express, PostgreSQL, React (Vite), Anthropic API.

## 1. Problem

Small service businesses (studios, clinics, consultants, barbers) lose customers and time to phone-tag and double bookings. They need three things: customers can see real availability and book at any hour, the business never double-books a person, and customers who prefer to simply say what they want ("Friday afternoon, an hour") can do that to an assistant.

## 2. Goals and non-goals

| Goals | Non-goals (for version 1) |
|---|---|
| Correct availability from opening hours, services and existing bookings | Online payments (planned: M-Pesa) |
| Double booking impossible even under simultaneous requests | Email/SMS reminders (planned) |
| Customers: register, book, see and cancel bookings under a clear policy | Staff self-service for hours and time off (hours are seeded in the database) |
| Admin: see bookings, mark complete or no-show, manage services, see a 30-day summary | Multiple locations or businesses (one business per deployment) |
| AI assistant that finds times and proposes actions, but a human confirms | Medical or other sensitive records (the demo business is deliberately neutral) |
| Safe to put on the public internet, cheap to run (free tiers), measurable | Mobile app |

## 3. Users and roles

| Role | Can do |
|---|---|
| Visitor | See services and free times |
| Customer | Everything a visitor can, plus book, cancel (until the cancellation deadline), use the assistant |
| Admin | Everything a customer can, plus view all bookings, change booking status, manage services, see statistics |

## 4. Requirements

### Functional
1. Services have a name, description, duration (multiple of 5 minutes), price (whole cents) and can be hidden.
2. Staff members perform some services and have weekly opening hours in the business's local time zone.
3. Availability for a service on a date is every start time, on a 15-minute grid, where at least one qualified staff member is open and free, respecting a minimum notice period and a booking horizon.
4. Booking picks the least busy free staff member; the customer may not overlap their own bookings or hold more than 5 upcoming ones.
5. Cancelling is allowed until 2 hours before the start (admins any time). Cancelling frees the time.
6. The assistant can list services, check availability, list the customer's bookings, propose a booking and propose a cancellation. It cannot change data.

### Non-functional
| Quality | Target | How it is met | How it is checked |
|---|---|---|---|
| Correctness | No double bookings | PostgreSQL exclusion constraint on (staff, time range) | Contract test fires 8 simultaneous inserts; exactly 1 wins |
| Security | OWASP basics covered | scrypt hashes, signed tokens, validation on every input, rate limits, CORS allow-list, security headers, least-privilege assistant | Security and HTTP tests (see docs/04) |
| Privacy | Minimal personal data | No payment or health data; access log hides IP addresses; assistant never sees notes | Tests on log format; docs/04 |
| Cost control | No surprise AI bill | Daily and per-user caps, 700-token answers, 6 calls per question | Assistant tests |
| Operability | Observable and debuggable | Health endpoint, access log in the Log Analyzer format, central error handling | HTTP tests |
| Maintainability | Easy to change | Rules separated from HTTP and SQL; same repository contract for memory and PostgreSQL | 54 automated tests |
| Performance | p95 under 300 ms for availability on a warm server | One indexed query per request plus a pure in-memory calculation | Measure with the Log Analyzer (see docs/07) |

## 5. Architecture in one picture

```text
Browser (React, GitHub Pages) --HTTPS/JSON--> Express API (Render) --SQL--> PostgreSQL
                                                  |   \--access log lines--> Log Analyzer
                                                  \--HTTPS--> Anthropic API (assistant, read and propose tools only)
```

Details and the reasons behind each choice: [01-architecture-and-decisions.md](01-architecture-and-decisions.md).

## 6. Phases

| Phase | Scope | Status |
|---|---|---|
| 1. Core | Schema, availability engine, booking rules, auth, REST API, tests | Built and tested |
| 2. Website | React pages: services, booking flow, my bookings, login, admin | Built; rendered in a smoke test; first real browser run is yours |
| 3. Assistant | Tool-using assistant with proposal cards, limits | Built and tested with a scripted AI; needs your API key to go live |
| 4. Release | CI with PostgreSQL, Docker, Render, GitHub Pages, docs | Files ready; you deploy with docs/05 |
| 5. Connect | Log Analyzer reads this API's access log; Inventory API tracks consumables | Planned: docs/07 |
| 6. Money | M-Pesa payment before confirming a booking | Planned |
| 7. Reminders | Email or SMS reminder 24 hours before | Planned |
| 8. Staff tools | Edit hours, time off and staff from the admin page | Planned |

## 7. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Free hosting sleeps | First load takes up to a minute | The website wakes the API on load and says so; documented |
| AI invents or misleads | Wrong booking | Assistant cannot book; cards need a human click; the server re-validates |
| Prompt injection | Misuse of tools | Tools are read or propose only; ownership checks happen on the server |
| AI cost abuse | Bill | Daily cap, per-user cap, login required, small model by default |
| Spam sign-ups and bookings | Pollution | Rate limits, per-customer limit of 5 upcoming bookings |
| Free database limits | Outage or data loss | Documented; export with pg_dump before expiry or limits |
| Time zone mistakes | Wrong slot times | UTC storage, tested conversions including daylight saving |

## 8. Definition of done (version 1)

- All tests green in CI, including the PostgreSQL contract tests.
- Website live on GitHub Pages, API live on Render, link in the portfolio.
- A stranger can register, book, cancel, and use the assistant without help.
- README states what is real, what is demo, and what was and was not tested.
