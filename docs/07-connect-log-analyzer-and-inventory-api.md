# Guide 07: Connecting the Log Analyzer and the Inventory API (later step)

## Log Analyzer (ready now)
The API already writes one line per request to its console in exactly the format the analyzer reads:

```text
- - 5 [26/Nov/2026:05:00:09 +0000] "GET /api/services HTTP/1.1" 200 512 7
```
(client shown as `-` for privacy, user is a numeric id, query strings removed, response time in milliseconds.)

**Try it locally**
1. Run the backend and save its output: in `backend`, `npm start *> access.log` is awkward in PowerShell; instead run `npm start | Tee-Object -FilePath access.log`.
2. Use the website for a few minutes, press **Ctrl+C**.
3. Delete the first lines that are not request lines, or ignore them: the analyzer counts non-matching lines as "malformed" and skips them.
4. In the `log-analyzer` folder: `.\scripts\run-without-maven.ps1 analyze --file ..\booking-assistant\backend\access.log`.

**On Render** the console log is available in the dashboard (Logs). The free plan does not keep files, so for a permanent record you would later add a small job that ships the log lines to a storage place the analyzer can read. That belongs to the connection step.

**Questions the analyzer answers for this API:** which minutes had errors (an outage), which routes are slow (`GET /api/availability` should stay fast), how many bookings and logins happen per hour, and how many requests are refused with 429 (someone hammering the login).

## Inventory API (planned design)
Idea: services consume stock. "Standard session" uses 1 towel pack and 1 disposable kit; when a booking is **completed**, the booking system tells the Inventory API to record a stock movement.

| Piece | Design |
|---|---|
| Trigger | Admin marks a booking COMPLETED |
| Mapping | A table `service_consumables (service_id, inventory_product_id, quantity)` in this database |
| Call | Server-to-server `POST /api/products/{id}/movements` on the Inventory API with a dedicated service account (never a customer's or admin's personal login) |
| Failure | If the Inventory API is asleep or down, queue the movement and retry; the booking status must not fail because of it |
| Idempotency | Send a unique key (booking id) so a retry cannot deduct stock twice |
| Visibility | Admin page shows low-stock items from `GET /api/products/low-stock` |

Check whether the Inventory API already protects against repeated calls; if not, adding an idempotency key there is a small change that belongs to the same step.
