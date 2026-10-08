from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import AsyncGenerator

from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from . import models
from .database import Base, engine, get_db
from .seed import seed_database
from .schemas import (
    BookingCreate,
    BookingDateRange,
    BookingResponse,
    ListingCreate,
    ListingResponse,
    ListingUpdate,
)

Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    seed_database()
    yield


app = FastAPI(title="Airbnb Clone API", lifespan=lifespan)

CLEANING_FEE = Decimal("35.00")
SERVICE_FEE_RATE = Decimal("0.10")
MONEY_PRECISION = Decimal("0.01")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"message": "Airbnb Clone API is running!"}


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/listings", response_model=list[ListingResponse])
def get_listings(
    search: str | None = Query(default=None),
    location: str | None = Query(default=None),
    guests: int | None = Query(default=None, gt=0),
    check_in: date | None = None,
    check_out: date | None = None,
    limit: int | None = Query(default=None, gt=0, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    if guests is not None and guests < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="guests must be greater than zero.",
        )
    if (check_in is None) != (check_out is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Both check_in and check_out are required for availability filtering.",
        )
    if check_in is not None and check_out is not None and check_out <= check_in:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="check_out must be after check_in.",
        )
    if limit is not None and (limit < 1 or limit > 100):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="limit must be between 1 and 100.",
        )
    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="offset must be zero or greater.",
        )

    query = db.query(models.Listing)
    search_term = search.strip() if search else ""
    if search_term:
        escaped_search = (
            search_term.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        pattern = f"%{escaped_search}%"
        query = query.filter(
            or_(
                models.Listing.location.ilike(pattern, escape="\\"),
                models.Listing.title.ilike(pattern, escape="\\"),
            )
        )
    location_term = location.strip() if location else ""
    if location_term:
        escaped_location = (
            location_term.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        query = query.filter(
            models.Listing.location.ilike(
                f"%{escaped_location}%",
                escape="\\",
            )
        )
    if guests is not None:
        query = query.filter(models.Listing.max_guests >= guests)
    if check_in is not None and check_out is not None:
        query = query.filter(
            ~models.Listing.bookings.any(
                and_(
                    models.Booking.check_in < check_out,
                    models.Booking.check_out > check_in,
                )
            )
        )

    query = query.order_by(models.Listing.id)
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    return query.all()


@app.get("/listings/{listing_id}", response_model=ListingResponse)
def get_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = (
        db.query(models.Listing)
        .filter(models.Listing.id == listing_id)
        .first()
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


@app.get(
    "/listings/{listing_id}/availability",
    response_model=list[BookingDateRange],
)
def get_listing_availability(listing_id: int, db: Session = Depends(get_db)):
    listing_exists = (
        db.query(models.Listing.id)
        .filter(models.Listing.id == listing_id)
        .first()
    )
    if listing_exists is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    return (
        db.query(models.Booking)
        .filter(models.Booking.listing_id == listing_id)
        .order_by(models.Booking.check_in)
        .all()
    )


@app.post(
    "/listings",
    response_model=ListingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_listing(listing_data: ListingCreate, db: Session = Depends(get_db)):
    listing = models.Listing(**listing_data.model_dump())
    db.add(listing)
    db.commit()
    db.refresh(listing)
    return listing


@app.put("/listings/{listing_id}", response_model=ListingResponse)
def update_listing(
    listing_id: int,
    listing_data: ListingUpdate,
    db: Session = Depends(get_db),
):
    listing = (
        db.query(models.Listing)
        .filter(models.Listing.id == listing_id)
        .first()
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")

    for field, value in listing_data.model_dump().items():
        setattr(listing, field, value)
    db.commit()
    db.refresh(listing)
    return listing


@app.delete("/listings/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_listing(listing_id: int, db: Session = Depends(get_db)):
    listing = (
        db.query(models.Listing)
        .filter(models.Listing.id == listing_id)
        .first()
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if db.query(models.Booking).filter(models.Booking.listing_id == listing_id).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This listing has bookings and cannot be deleted.",
        )

    db.delete(listing)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/bookings", response_model=BookingResponse, status_code=201)
def create_booking(booking_data: BookingCreate, db: Session = Depends(get_db)):
    listing = (
        db.query(models.Listing)
        .filter(models.Listing.id == booking_data.listing_id)
        .first()
    )
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    if booking_data.guest_count > listing.max_guests:
        raise HTTPException(
            status_code=422,
            detail=f"Guest count cannot exceed this listing's maximum capacity of {listing.max_guests}.",
        )

    overlapping_booking = (
        db.query(models.Booking)
        .filter(
            models.Booking.listing_id == listing.id,
            models.Booking.check_in < booking_data.check_out,
            models.Booking.check_out > booking_data.check_in,
        )
        .first()
    )
    if overlapping_booking is not None:
        raise HTTPException(
            status_code=409,
            detail="The listing is unavailable for the selected dates.",
        )

    nights = (booking_data.check_out - booking_data.check_in).days
    subtotal = (
        Decimal(str(listing.price_per_night)) * nights
    ).quantize(MONEY_PRECISION, rounding=ROUND_HALF_UP)
    service_fee = (subtotal * SERVICE_FEE_RATE).quantize(
        MONEY_PRECISION,
        rounding=ROUND_HALF_UP,
    )
    total_price = subtotal + CLEANING_FEE + service_fee
    booking = models.Booking(
        listing_id=listing.id,
        check_in=booking_data.check_in,
        check_out=booking_data.check_out,
        guest_count=booking_data.guest_count,
        total_price=float(total_price),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@app.get("/bookings", response_model=list[BookingResponse])
def get_bookings(db: Session = Depends(get_db)):
    return db.query(models.Booking).order_by(models.Booking.created_at.desc()).all()
