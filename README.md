# Airbnb Clone — Airbnb-Style Rental Marketplace

A full-stack rental marketplace inspired by Airbnb, built with **Next.js, TypeScript, FastAPI, and SQLite**. Explore stays, check availability, book trips, and manage property listings through a host dashboard.

<p align="center">

  **[🚀 Live Demo](https://airbnb-clone-ruddy-sigma.vercel.app/) · [💻 GitHub Repository](https://github.com/NeerajSkillsUp/airbnb-clone)**

</p>

---

## ✨ Features

- **Explore & Search** — Browse photo-rich property cards, search destinations, filter by category, and navigate paginated results.
- **Listing Details** — View property information, a responsive photo gallery, host details, amenities, illustrative reviews, and a two-month availability calendar.
- **Booking Workflow** — Select dates and guests, validate availability, view an itemized price estimate, and receive a mock booking confirmation.
- **My Trips** — View bookings associated with the selected demo guest.
- **Host Dashboard** — Create, edit, and delete owned listings, and view bookings for hosted properties.
- **Ownership Checks** — Prevent unauthorized listing updates/deletions and protect listings that have existing bookings.
- **Demo Identities** — Switch between guest and host profiles; the selection persists in browser local storage.
- **Responsive UI** — A modern, photo-forward marketplace layout designed for different screen sizes.

### Booking price calculation

| Component | Calculation |
|---|---|
| Nightly subtotal | Nightly price × number of nights |
| Cleaning fee | $35 per booking |
| Service fee | 10% of nightly subtotal |
| Total | Nightly subtotal + cleaning fee + service fee |

The backend calculates the authoritative booking total and validates dates, guest capacity, and overlapping reservations.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router, React, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, Pydantic |
| ORM | SQLAlchemy |
| Database | SQLite |
| Deployment | Vercel (frontend), Render (backend) |

---

## 🏗️ Architecture

```text
Browser
   │
   ▼
Next.js + TypeScript
   │  HTTP / JSON
   ▼
FastAPI
   │
   ├── Pydantic schemas — request/response validation
   ├── SQLAlchemy models — database operations
   ├── Booking validation — dates, capacity, price, overlaps
   └── Listing ownership checks
          │
          ▼
      SQLite database
```

The frontend communicates with FastAPI through `NEXT_PUBLIC_API_URL`. The backend separates API routes, request/response schemas, database models, and seeding logic.

### Project structure

```text
airbnb-clone/
├── frontend/
│   └── src/app/
│       ├── page.tsx                  # Explore and search
│       ├── layout.tsx                # Shared layout/navigation
│       ├── demo-identity.tsx         # Guest/host selector
│       ├── listings/[id]/page.tsx    # Details and booking
│       ├── host/page.tsx             # Host dashboard
│       └── trips/page.tsx            # My Trips
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI routes
│   │   ├── models.py                # SQLAlchemy entities
│   │   ├── schemas.py               # Pydantic schemas
│   │   ├── database.py              # Database setup/migration
│   │   └── seed.py                  # Demo data
│   ├── tests/
│   └── requirements.txt
└── README.md
```

---

## 🗄️ Database Design

The schema uses three main entities with SQLAlchemy relationships and foreign keys.

| Entity | Purpose | Important fields |
|---|---|---|
| **User** | Demo guests and hosts | `id`, display name, role |
| **Listing** | Property information | `id`, title, location, price, capacity, `host_id` |
| **Booking** | Reservations and totals | `id`, `listing_id`, `guest_id`, check-in, check-out, guest count, total price |

### Relationships

- **User → Listing:** One host can own multiple listings.
- **User → Booking:** One guest can have multiple bookings.
- **Listing → Booking:** One listing can have multiple bookings over different dates.
- Each booking references both its listing and the guest who made it.

On startup, the backend creates missing tables and performs a small additive SQLite migration for the ownership fields. The seeder creates four stable demo identities and, when the listings table is empty, inserts eight sample listings and three sample bookings.

Existing records are preserved by the seeder. The migration is a lightweight SQLite compatibility migration, not a general-purpose migration framework.

---

## 🚀 Run Locally

### Prerequisites

- Python 3.10+
- Node.js and npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/NeerajSkillsUp/airbnb-clone.git
cd airbnb-clone
```

### 2. Start the backend

From the project root, run:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

The API starts at `http://127.0.0.1:8000`.

- Interactive API documentation: `http://127.0.0.1:8000/docs`
- Health endpoint: `http://127.0.0.1:8000/health`

The database defaults to `sqlite:///./airbnb.db`. Run the backend from the `backend/` directory so the database file is created there.

To seed the database manually:

```powershell
python -m app.seed
```

Seeding inserts sample listings only when the listings table is empty.

### 3. Start the frontend

Open a second terminal from the project root:

```powershell
cd frontend
npm ci
```

Create `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

Then start Next.js:

```powershell
npm run dev
```

Open **`http://localhost:3000`**.

If PowerShell blocks virtual-environment activation, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` in that terminal and activate the environment again.

---

## 🔌 API Overview

The FastAPI backend exposes the following main endpoints.

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/users` | Retrieve demo identities; optionally filter by role |
| `GET` | `/listings` | Search, filter, paginate, and retrieve listings |
| `GET` | `/listings/{id}` | Retrieve listing details |
| `GET` | `/listings/{id}/availability` | Retrieve booked date ranges |
| `POST` | `/listings` | Create a listing for a host |
| `PUT` | `/listings/{id}` | Update a listing with ownership validation |
| `DELETE` | `/listings/{id}?host_id=...` | Delete an owned listing when no bookings prevent deletion |
| `POST` | `/bookings` | Validate and create a booking |
| `GET` | `/bookings` | Retrieve bookings, optionally filtered by `guest_id` |
| `GET` | `/hosts/{host_id}/bookings` | Retrieve bookings for a host's listings |

The listings endpoint supports search, location, guest capacity, availability dates, host filtering, and pagination through query parameters. See `/docs` for request schemas, validation rules, and response examples.

---

## 🧪 Testing

Run backend tests from the `backend/` directory:

```powershell
python -m unittest discover -s tests -v
```

Run frontend checks from the `frontend/` directory:

```bash
npm run lint
npm run build
```

**Latest reported validation:** 21 backend tests passed, and frontend lint and production build passed.

Tests cover search, capacity and availability filters, pagination, booking validation, fee calculation, overlap rejection, seeding, ownership assignment, and SQLite migration behavior.

---

## ☁️ Deployment

- **Frontend:** [Vercel live application](https://airbnb-clone-ruddy-sigma.vercel.app/)
- **Backend:** [Render API](https://airbnb-clone-api-48zh.onrender.com)
- **API documentation:** [FastAPI Swagger UI](https://airbnb-clone-api-48zh.onrender.com/docs)

The deployed frontend uses `NEXT_PUBLIC_API_URL` to communicate with the backend. The backend must allow the deployed frontend origin through its CORS configuration.

### Database persistence

The current Render free-tier deployment uses SQLite on an ephemeral filesystem. Data can be lost after restarts, spin-downs, or redeployments. Durable SQLite storage requires a persistent disk on a plan that supports it; automatic seeding can restore demo data but cannot restore later user-created bookings or edits.

---

## 📌 Assumptions & Limitations

- **Demo identities, not authentication:** guest/host selection is stored in browser local storage. Ownership checks support the demo workflow but are not a security boundary against callers who can submit arbitrary IDs.
- **Mock checkout:** no real payments are processed.
- **Illustrative content:** extra gallery photos, amenities, and sample reviews may not represent the exact property or verified guest feedback.
- **Image URLs:** listings use image URLs; cloud image uploads are not implemented.
- **Persistence:** database durability depends on the deployment storage configuration.
- **No messaging or identity verification:** these production features are outside the scope of this assignment.

---

Built as a full-stack engineering assignment to demonstrate marketplace UI development, API design, relational data modeling, booking validation, and host/guest workflows.