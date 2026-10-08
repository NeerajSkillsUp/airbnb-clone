# Airbnb-Style Rental Marketplace

A full-stack demonstration rental marketplace built with Next.js, React,
TypeScript, Tailwind CSS, FastAPI, SQLAlchemy, and SQLite. Visitors can explore
and search properties, inspect listing details, and make date-based bookings.
A demo host dashboard supports property listing management.

## Features

- Browse database-backed property listings in a responsive marketplace grid.
- Search listing titles and locations from the backend, ignoring case and
  surrounding whitespace.
- Filter listings by category and toggle favorites in the browser.
- View individual listing details and submit bookings with date and guest
  validation.
- Calculate booking prices on the server and reject overlapping reservations.
- Review all saved bookings on the demo **My Trips** page.
- Create, update, and delete listings from the demo **Host dashboard**.
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
- The database engine uses `sqlite:///./airbnb.db`. This is a relative path:
  start the backend from the `backend` directory to use
  `backend/airbnb.db`.
- On backend startup, `Base.metadata.create_all()` creates tables that do not
  exist. It does not reset existing listing rows. The project does not currently
  include a migration framework.

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
│       ├── models.py             # Listing and Booking SQLAlchemy models
│       ├── schemas.py            # Pydantic request/response schemas
│       └── seed.py               # Optional sample listing seeder
└── frontend/
    ├── package.json
    ├── package-lock.json
    ├── public/                   # Static frontend assets
    └── src/
        └── app/
            ├── globals.css
            ├── layout.tsx
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

Starting the API creates missing tables but does **not** seed listings. For a
fresh checkout with no populated database, create the sample listings by
running this command from `backend` before or after starting the API:

```powershell
python -m app.seed
```

The seeder creates the schema if needed and inserts its eight sample listings
only when the database contains zero listings. If listings already exist, it
prints a message and skips seeding; it does not top up or replace existing
data.

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

The SQLite URL is currently a constant in `backend/app/database.py`:
`sqlite:///./airbnb.db`. It is **not** read from an environment variable.
Because that path is relative to the backend process's current directory, run
the API from `backend` to use the database file at `backend/airbnb.db`.

The API currently allows the frontend origin `http://localhost:3000` through
CORS. If you run the frontend on a different origin, adjust
`allow_origins` in `backend/app/main.py` as well as `NEXT_PUBLIC_API_URL` if
the API address changed.

## Frontend routes

| Route | Description |
| --- | --- |
| `/` | Explore listings, search by destination/title, filter by category, and toggle favorites. Favorites are browser state and are not persisted. |
| `/listings/[id]` | Listing details and booking form. |
| `/trips` | Displays bookings returned by the API. This is a demo-wide view, not a user-specific trip list. |
| `/host` | Demo dashboard to create, edit, and delete listings. It is not protected by authentication. |

## API endpoints

All endpoints are served by FastAPI at the configured API origin.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | API welcome response. |
| `GET` | `/health` | Returns the API health status. |
| `GET` | `/listings` | Returns all listings. Optional `search` query parameter filters title or location case-insensitively; blank surrounding whitespace is ignored. |
| `GET` | `/listings/{listing_id}` | Returns one listing or `404` if it does not exist. |
| `POST` | `/listings` | Creates a listing; returns `201` and the created listing. |
| `PUT` | `/listings/{listing_id}` | Replaces editable listing fields; returns `404` for an unknown listing. |
| `DELETE` | `/listings/{listing_id}` | Deletes a listing and returns `204`. Returns `404` if missing and `409` if the listing has bookings. |
| `POST` | `/bookings` | Creates a booking; returns `201` and the saved booking, including listing summary and calculated total. |
| `GET` | `/bookings` | Returns saved bookings, newest first, with listing ID/title/location and reservation information. |

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
  "max_guests": 2
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
  "guest_count": 2
}
```

The server verifies that the listing exists, check-out is after check-in, the
guest count is positive and does not exceed the listing capacity, and the dates
do not overlap another booking for that listing. Booking dates occupy
`[check_in, check_out)`: check-in is included and check-out is excluded, so a
new reservation may start on the previous reservation's check-out date.

The server calculates `total_price` as nightly price multiplied by the number
of nights; a client does not provide an authoritative total. Invalid schema
input or guest capacity returns `422`, a missing listing returns `404`, and
unavailable dates return `409`.

## Database and sample data

The SQLAlchemy models are defined in `backend/app/models.py`. A listing can have
many bookings; each booking references a listing through a foreign key. At
startup, importing the FastAPI application runs `Base.metadata.create_all()`
and creates missing tables without clearing existing data. This creates tables
only: it does not insert sample listings automatically.

To populate a fresh or empty database with sample listings:

```powershell
cd .\backend
python -m app.seed
```

The seeder checks the listing count first and skips inserting if any listings
already exist. This workspace contains a local `backend/airbnb.db` file, but a
fresh checkout should not rely on that local database being present or
pre-populated. Back up local data before manually replacing or removing the
database file.

## Checks and testing

Run the frontend checks from `frontend`:

```powershell
npm run lint
npm run build
```

There is no automated backend test suite or test-runner configuration in this
project. A Python syntax/bytecode compilation check is available from
`backend`:

```powershell
.\.venv\Scripts\python.exe -m compileall -q app
```

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
  `backend`. It intentionally does nothing when any listing already exists.
- **A listing cannot be deleted:** the API protects listings that have
  bookings and responds with `409 Conflict`.
- **A booking request is rejected:** check the ISO date values, ensure
  check-out is later than check-in, stay within the listing's guest capacity,
  and choose dates that do not overlap another reservation.

## Demo limitations

This is an assignment/demo project, not a production booking service. There is
no user authentication, account ownership, or authorization. The `/trips` page
shows all bookings returned by the API, and the host dashboard can manage the
shared listing collection. There is no payment processing, image upload,
cancellation flow, or user-specific booking management. Do not expose this API
as-is to untrusted users.
