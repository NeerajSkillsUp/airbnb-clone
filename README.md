# Airbnb-Style Rental Marketplace

A full-stack demonstration rental marketplace built with Next.js, React,
TypeScript, Tailwind CSS, FastAPI, SQLAlchemy, and SQLite. Visitors can explore
and search properties, inspect listing details, and make date-based bookings.
A demo host dashboard supports property listing management.

## Features

- Browse database-backed property listings in a responsive marketplace grid.
- Automatically seed varied sample listings and a few existing bookings when
  the database has no listings.
- Search listing titles and locations from the backend, ignoring case and
  surrounding whitespace.
- Filter stays by guest capacity and date availability, and load additional
  results with pagination.
- Filter listings by category and toggle favorites in the browser.
- View booked date ranges on listing details and submit bookings with date and
  guest validation.
- Listing details show the related host name, a responsive sample-photo
  gallery, and explicitly labeled demo amenities and review examples.
- Listing detail availability includes a calendar built from booked date ranges
  returned by the API; booking submission remains server-validated.
- Estimate nightly subtotal, a $35 cleaning fee per booking, and a 10% service
  fee; the backend calculates the final booking total and rejects overlaps.
- Review all saved bookings on the demo **My Trips** page.
- Select a mock guest or host identity in the shared navigation; the selection
  is stored in browser local storage.
- Create, update, and delete listings owned by the selected host, and view
  bookings for those properties on the demo **Host dashboard**.
- Associate reservations with the selected guest and show only that guest's
  bookings on **My Trips**.
- Prevent deletion of listings that already have bookings.

## Technology and architecture

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS 4.
- **Backend:** FastAPI, Pydantic, SQLAlchemy.
- **Database:** SQLite.
- Backend direct requirements are `fastapi`, `uvicorn[standard]`, and
  `sqlalchemy` (listed without version pins in `backend/requirements.txt`).
  FastAPI installs Pydantic as a dependency; the backend code uses Pydantic 2
  APIs.
- The browser UI makes HTTP requests to the FastAPI service using the
  `NEXT_PUBLIC_API_URL` environment variable.
- FastAPI validates request and response data with Pydantic schemas and reads
  and writes records through SQLAlchemy models.
- The database engine uses SQLite. By default it uses
  `sqlite:///./airbnb.db`, a relative path; start the backend from the
  `backend` directory to use `backend/airbnb.db`. Set `SQLITE_DATABASE_URL` to
  use a different SQLite file path, such as a mounted persistent disk.
- On backend startup, a small SQLite migration creates the users table and adds
  nullable ownership columns to existing listings/bookings before SQLAlchemy
  creates any remaining tables. It preserves existing rows and is not a general
  migration framework.

## Project structure

```text
airbnb-clone/
├── README.md
├── backend/
│   ├── airbnb.db                 # Local SQLite database file (may be absent in a fresh checkout)
│   ├── requirements.txt
│   └── app/
│       ├── __init__.py
│       ├── database.py           # SQLite engine, session, and Base
│       ├── main.py               # FastAPI application and API routes
│       ├── models.py             # User, Listing, and Booking SQLAlchemy models
│       ├── schemas.py            # Pydantic request/response schemas
│       └── seed.py               # Idempotent sample listing/booking seeder
│   └── tests/
│       ├── test_search_and_availability.py
│       └── test_seed.py                # Initial seed, repeat-run, and availability checks
└── frontend/
    ├── package.json
    ├── package-lock.json
    ├── public/                   # Static frontend assets
    └── src/
        └── app/
            ├── globals.css
            ├── layout.tsx
            ├── demo-identity.tsx # Shared demo identity selector and state
            ├── page.tsx           # Explore homepage
            ├── host/
            │   └── page.tsx       # Demo listing-management dashboard
            ├── listings/
            │   └── [id]/
            │       └── page.tsx   # Listing details and booking form
            └── trips/
                └── page.tsx       # Demo view of saved bookings
```

Generated frontend dependencies/build output and the Python virtual environment
are not part of the source structure above.

## Local setup (Windows PowerShell)

Prerequisites: Node.js with npm, and Python 3.10 or newer. Python 3.10 is the
minimum inferred from the backend's use of `str | None` type-union syntax;
`requirements.txt` does not declare a Python-version range. The source uses
Pydantic 2 APIs, although Pydantic is not separately pinned in
`requirements.txt`.

### 1. Set up and start the backend

Open a PowerShell terminal at the project root:

```powershell
cd .\backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python --version
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Confirm that `python --version` reports Python 3.10 or newer before installing
the backend requirements.

If PowerShell blocks virtual-environment activation, either allow it for the
current terminal with
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`, or run the
environment's Python directly as
`.\.venv\Scripts\python.exe`.

On API startup, missing tables are created. If the database contains no
listings, the app automatically inserts the eight sample listings and three
sample bookings. If any listing already exists, automatic seeding skips all
sample inserts, preserving current listings and bookings.

The same idempotent seeder can also be run manually from `backend`:

```powershell
python -m app.seed
```

The command creates the schema if needed. It seeds only an empty listings
table; repeated runs do not duplicate or replace listings, and do not delete
bookings.

Start the API from the same `backend` directory:

```powershell
uvicorn app.main:app --reload
```

The API is available at `http://127.0.0.1:8000`. FastAPI's interactive API
documentation is at `http://127.0.0.1:8000/docs`.

### 2. Configure and start the frontend

Open a **second** PowerShell terminal at the project root:

```powershell
cd .\frontend
npm ci
```

Create `frontend/.env.local` locally (it is ignored by Git) with the API base URL:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

If the backend uses another origin or port, update the value here and update
the backend CORS allow-list in `backend/app/main.py` to include the frontend's
origin.

Start the Next.js development server:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## Environment and configuration

| Name | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | Frontend | Base URL for FastAPI requests. The current local value is `http://127.0.0.1:8000`. Because it has the `NEXT_PUBLIC_` prefix, it is available to browser-side code; do not put secrets in it. |
| `SQLITE_DATABASE_URL` | Backend | Optional SQLAlchemy SQLite URL. Defaults to `sqlite:///./airbnb.db`; use `sqlite:////var/data/airbnb.db` when a Render persistent disk is mounted at `/var/data`. |

If `SQLITE_DATABASE_URL` is unset, the SQLite path remains relative to the
backend process's working directory, so run the API from `backend` to use
`backend/airbnb.db`.

### Deploying the backend to Render with persistent SQLite

Render's local service filesystem is ephemeral by default. Automatic seeding
populates an empty database after startup, but it does not make later bookings
or host edits durable. To preserve SQLite data across restarts and deployments:

1. Set the Render service root directory to `backend`, build command to
   `pip install -r requirements.txt`, and start command to
   `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
2. Attach a Render persistent disk to the backend service with mount path
   `/var/data`.
3. Set the service environment variable
   `SQLITE_DATABASE_URL=sqlite:////var/data/airbnb.db`, then deploy.
4. On the first startup with an empty disk, the app creates the schema and
   inserts the sample listings and bookings. Subsequent startups preserve data
   already on that disk.

Render currently only supports persistent disks on paid web-service instances.
Free web services use ephemeral storage, spin down when idle, and lose local
SQLite changes on restarts, spin-downs, or redeploys. Without a paid disk, the
database can be reseeded after a restart but user bookings and listing edits
are not durable. See [Render disks](https://render.com/docs/disks) and
[Render free instance limitations](https://render.com/docs/free).

The API currently allows the frontend origin `http://localhost:3000` through
CORS. If you run the frontend on a different origin, adjust
`allow_origins` in `backend/app/main.py` as well as `NEXT_PUBLIC_API_URL` if
the API address changed.

## Frontend routes

| Route | Description |
| --- | --- |
| `/` | Explore listings, search by destination/title, filter by category, and toggle favorites. Favorites are browser state and are not persisted. |
| `/listings/[id]` | Listing details, responsive gallery, host summary, demo amenities/review examples, availability calendar, and booking form. Gallery images beyond the listing's primary image are illustrative sample photos; amenity and review content is not verified listing/guest data. |
| `/trips` | Displays bookings belonging to the selected guest demo identity. |
| `/host` | Displays and manages listings and bookings belonging to the selected host demo identity. |

## API endpoints

All endpoints are served by FastAPI at the configured API origin.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | API welcome response. |
| `GET` | `/health` | Returns the API health status. |
| `GET` | `/users` | Returns demo users; optional `role` filters to `guest` or `host`. |
| `GET` | `/listings` | Returns listings. Optional `host_id` filters by owner; `search` matches title or location case-insensitively; `location` separately filters the location; `guests` requires sufficient capacity; `check_in` and `check_out` together exclude overlapping bookings; `limit` and `offset` paginate results. When `limit` is omitted, all matching rows are returned as before. |
| `GET` | `/listings/{listing_id}` | Returns one listing or `404` if it does not exist. |
| `GET` | `/listings/{listing_id}/availability` | Returns the listing's booked check-in/check-out ranges, or `404` if the listing does not exist. |
| `POST` | `/listings` | Creates a listing for the required `host_id`; returns `201`. |
| `PUT` | `/listings/{listing_id}` | Replaces editable listing fields for the owning `host_id`; returns `403` if the selected host does not own it. |
| `DELETE` | `/listings/{listing_id}?host_id=...` | Deletes a listing owned by the selected host and returns `204`; returns `403` for a non-owner and `409` if the listing has bookings. |
| `POST` | `/bookings` | Creates a booking for the required `guest_id`; returns `201` and the saved booking, including listing summary and calculated total. |
| `GET` | `/bookings?guest_id=...` | Filters bookings by guest. If omitted, preserves the existing unfiltered response. |
| `GET` | `/hosts/{host_id}/bookings` | Returns bookings for listings owned by the specified host. |

### Listing request fields

`POST /listings` and `PUT /listings/{listing_id}` expect the full set of editable
fields:

```json
{
  "title": "A quiet city apartment",
  "location": "Lisbon, Portugal",
  "description": "A comfortable apartment near the historic center.",
  "price_per_night": 125,
  "category": "Design",
  "image_url": "https://example.com/apartment.jpg",
  "max_guests": 2,
  "host_id": 3
}
```

Text fields must be nonblank after trimming and fit their schema limits:
title 200 characters, location 200, description 5,000, category 100, and image
URL 500. Nightly price must be a finite number greater than zero. Guest capacity
must be an integer from 1 through 100. New listings use the SQLAlchemy model's
default rating of `0.0`; the host form does not edit ratings.

### Booking request fields

`POST /bookings` expects only:

```json
{
  "listing_id": 1,
  "check_in": "2030-06-10",
  "check_out": "2030-06-13",
  "guest_count": 2,
  "guest_id": 1
}
```

The server verifies that the listing exists, check-out is after check-in, the
guest count is positive and does not exceed the listing capacity, and the dates
do not overlap another booking for that listing. Booking dates occupy
`[check_in, check_out)`: check-in is included and check-out is excluded, so a
new reservation may start on the previous reservation's check-out date.

The server calculates `total_price` as the nightly subtotal plus a $35 cleaning
fee per booking and a 10% service fee on the nightly subtotal; the client does
not provide an authoritative total. These fee values are demonstration
assumptions, not fees charged by a payment provider. Invalid schema input or
guest capacity returns `422`, a missing listing returns `404`, and unavailable
dates return `409`. Availability search requires both dates, with check-out
after check-in; guest counts must be positive. Invalid filter values return
`422`.

## Database and sample data

The SQLAlchemy models are defined in `backend/app/models.py`. A listing belongs
to a host user and can have many bookings; each booking references both its
listing and guest user through nullable foreign keys. Demo roles are plain
`guest`/`host` values, not authenticated accounts.

The SQLite migration runs before `Base.metadata.create_all()` and adds
`listings.host_id` and `bookings.guest_id` only when missing. It then seeds four
stable demo identities idempotently. Eight sample listings and three sample
bookings are inserted only when the listings table is empty. Existing listing
and booking fields and non-null ownership IDs are preserved; legacy rows with
null ownership IDs are assigned to demo identities.

To populate a fresh or empty database with sample listings:

```powershell
cd .\backend
python -m app.seed
```

The seeder checks the listing count first and skips inserting if any listings
already exist. Repeated runs do not duplicate or replace data and do not delete
bookings. This workspace contains a local `backend/airbnb.db` file, but a fresh
checkout should not rely on that local database being present or pre-populated.
Back up local data before manually replacing or removing the database file.

## Checks and testing

Run the frontend checks from `frontend`:

```powershell
npm run lint
npm run build
```

Run the backend unit tests from `backend` with Python's standard library:

```powershell
python -m unittest discover -s tests -v
```

The tests use isolated in-memory SQLite databases and cover title/location
search, capacity and availability filtering, invalid date ranges, pagination,
booked date ranges, booking fee calculation, and overlap rejection.
Seeding tests also cover initial sample data, repeat-run preservation,
ownership backfill, legacy SQLite schema migration, and availability of seeded
booking ranges.

For a manual API smoke check while the backend is running:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/listings
Invoke-RestMethod http://127.0.0.1:8000/bookings
```

For interactive request/response exploration, use
`http://127.0.0.1:8000/docs`.

## Troubleshooting

- **The frontend cannot reach the API:** check that Uvicorn is running, that
  `NEXT_PUBLIC_API_URL` points to the correct API origin, and that the
  frontend's origin is listed in FastAPI CORS configuration.
- **The frontend still uses an old API URL:** restart the Next.js development
  server after changing `.env.local`.
- **Listings appear missing or a new database file appears:** the SQLite path
  is relative to the process working directory. Start Uvicorn from `backend`.
- **The database has no sample listings:** run `python -m app.seed` from
  `backend`, or restart the app with an empty listings table. It intentionally
  does nothing when any listing already exists.
- **A listing cannot be deleted:** the API protects listings that have
  bookings and responds with `409 Conflict`.
- **A booking request is rejected:** check the ISO date values, ensure
  check-out is later than check-in, stay within the listing's guest capacity,
  and choose dates that do not overlap another reservation.

## Demo limitations

This is an assignment/demo project, not a production booking service. The
identity selector, ownership checks, and booking filters use client-selected
demo IDs; they are not authentication and do not protect the API from a caller
claiming another user's ID. There is no payment processing, image upload, or
cancellation flow. Do not expose this API as-is to untrusted users.
