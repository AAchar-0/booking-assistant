-- Booking Assistant: initial schema (PostgreSQL 13 or newer).
-- Run with: npm run migrate   (the script remembers which files were applied)

-- Needed so an exclusion constraint can mix "equals" (staff) with "overlaps" (time range).
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 100),
  role          TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'ADMIN')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Emails are unique ignoring upper/lower case: Ann@x.com and ann@x.com are the same person.
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE services (
  id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description      TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 500),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 480 AND duration_minutes % 5 = 0),
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),   -- money is stored as whole cents, never as decimals
  currency         CHAR(3) NOT NULL DEFAULT 'KES',
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE staff (
  id     INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name   TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Which staff member can perform which service.
CREATE TABLE staff_services (
  staff_id   INTEGER NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

-- Weekly opening hours per staff member, in the BUSINESS'S local time. weekday: 0 = Sunday ... 6 = Saturday.
CREATE TABLE staff_hours (
  staff_id   INTEGER NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  CHECK (end_time > start_time),
  PRIMARY KEY (staff_id, weekday, start_time)
);

CREATE TABLE bookings (
  id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES users (id),
  staff_id    INTEGER NOT NULL REFERENCES staff (id),
  service_id  INTEGER NOT NULL REFERENCES services (id),
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
  notes       TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
  created_via TEXT NOT NULL DEFAULT 'WEB' CHECK (created_via IN ('WEB', 'ASSISTANT')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  CHECK (ends_at > starts_at),

  -- THE important rule, enforced by the database itself: one staff member cannot have two active bookings whose
  -- time ranges overlap. Back-to-back bookings (one ends 10:00, the next starts 10:00) are allowed.
  -- Cancelled and no-show bookings free the time again.
  CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('CONFIRMED', 'COMPLETED'))
);

CREATE INDEX bookings_customer_idx ON bookings (customer_id, starts_at);
CREATE INDEX bookings_starts_idx ON bookings (starts_at);
