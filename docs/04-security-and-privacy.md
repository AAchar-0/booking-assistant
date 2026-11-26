# Security and Privacy

## Threats and defences
| Threat | Defence | Where |
|---|---|---|
| Stolen passwords from a leak | scrypt with a random salt per user; passwords never logged | `auth/passwords.js` |
| Guessing passwords | 10 login attempts per 15 minutes per IP and email; 10 sign-ups per hour per IP | `routes.js` |
| Finding which emails exist | Same answer and same work for unknown email and wrong password | `routes.js` |
| Forged login tokens | HS256 signature, expiry, only the expected algorithm accepted | `auth/tokens.js` |
| Stale permissions | User and role loaded from the database on every request | `app.js` |
| SQL injection | Placeholders only (`$1, $2`); no string-built SQL | `repo/pgRepo.js` |
| Bad input | Every field validated and cleaned; unknown fields dropped | `http/validate.js` |
| Reading other people's bookings | Ownership checked; not-yours looks like not-found | `bookingService.js` |
| Double booking by racing | Database constraint | `001_init.sql` |
| Cross-site calls from other websites | CORS allows exactly one origin | `app.js` |
| Large or broken bodies | 20 KB limit, clean 400 and 413 answers | `app.js` |
| Information leaks in errors | Unknown errors return a generic message; details only in the server log | `app.js` |
| AI misuse and cost | See docs/03 | `ai/*` |
| Malicious HTML | React escapes all output; the app never uses innerHTML | frontend |
| Open redirects after login | `next` is followed only if it is a path inside the app | `AuthPage.jsx` |
| Leaked secrets | Secrets only in environment variables; `.env` is git-ignored; the example file holds no values | `.gitignore` |

## Honest limits
- The token lives in localStorage. That is acceptable here because nothing untrusted is rendered as HTML, but cookies with `HttpOnly` would be stronger if the website and API shared one domain.
- GitHub Pages cannot send security headers, so the website has no Content-Security-Policy. The API sends strict headers.
- Rate limits are in memory and per instance.
- There is no email verification and no password reset yet (both planned).
- No external security audit has been done. Treat this as a well-built demo, not a certified system.

## Personal data
| Data | Why | Retention advice |
|---|---|---|
| Email, name, password hash | Account and booking | Delete accounts on request |
| Booking times and service | The service itself | Delete after the legal retention period |
| Notes (500 characters, optional) | Convenience | The UI asks users not to enter sensitive details; the assistant never sees notes |
| Access log | Operations | IP addresses are replaced with "-" by default; the user is a number |

Kenya's Data Protection Act, 2019 and similar laws (GDPR for visitors from the EU) apply to real deployments: have a privacy notice, collect only what you need, let people see and delete their data, and register with the regulator if required. This demo uses invented business data and is not a real shop.

## Reporting
Found a problem? Open an issue on the repository without posting secrets or personal data.
