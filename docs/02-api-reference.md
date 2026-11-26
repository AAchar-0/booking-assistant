# API Reference

Base path `/api`. JSON in and out. Protected endpoints need `Authorization: Bearer <token>`.
Errors look like `{ "error": { "code": "SLOT_UNAVAILABLE", "message": "...", "details": { "field": "problem" } } }`.

| Method and path | Who | Purpose |
|---|---|---|
| GET `/health` | anyone | `{ status, database, assistant }` |
| GET `/config` | anyone | Business name, time zone, rules, `today` |
| POST `/auth/register` | anyone | `{ email, fullName, password (10+ chars) }` returns token and user |
| POST `/auth/login` | anyone | `{ email, password }` returns token and user |
| GET `/me` | user | The logged-in user |
| GET `/services` | anyone | Active services |
| GET `/availability?serviceId=&date=YYYY-MM-DD` | anyone | Free start times with `localTime`, `startsAt`, `staffIds` |
| POST `/bookings` | user | `{ serviceId, startsAt, staffId?, notes?, via? }` returns 201 and the booking |
| GET `/bookings/mine` | user | The customer's bookings |
| POST `/bookings/:id/cancel` | user | Cancel (own booking, before the deadline) |
| POST `/assistant/chat` | user | `{ messages: [{ role, content }] }` returns `{ reply, proposals }` |
| GET `/admin/bookings?from=&to=&status=` | admin | Bookings with customer names |
| PATCH `/admin/bookings/:id` | admin | `{ status }` |
| GET `/admin/services` | admin | All services including hidden |
| POST `/admin/services` | admin | Create a service |
| PATCH `/admin/services/:id` | admin | Change fields or `active` |
| GET `/admin/stats` | admin | Last 30 days by status and service |

## Error codes

| Status | Code | Meaning |
|---|---|---|
| 400 | VALIDATION | Bad input; `details` lists the fields |
| 401 | UNAUTHENTICATED | Missing, expired or forged token, or wrong login |
| 403 | FORBIDDEN | Not allowed (admin only, or past the cancellation deadline) |
| 404 | NOT_FOUND | Missing, or not yours |
| 409 | SLOT_UNAVAILABLE, SLOT_TAKEN, EMAIL_TAKEN, TOO_MANY_BOOKINGS, OVERLAPS_YOUR_BOOKING, NOT_CANCELLABLE | A business rule says no |
| 413 | TOO_LARGE | Body over 20 KB |
| 429 | RATE_LIMITED | Slow down; see the Retry-After header |
| 502, 503 | ASSISTANT_ERROR, ASSISTANT_DISABLED, ASSISTANT_BUSY | Assistant problems |

## Try it (PowerShell: use curl.exe, because plain curl is a different command there)

```powershell
curl.exe http://localhost:8080/api/services
curl.exe -X POST http://localhost:8080/api/auth/register -H "Content-Type: application/json" -d '{\"email\":\"me@example.com\",\"fullName\":\"Me\",\"password\":\"a long password\"}'
```
