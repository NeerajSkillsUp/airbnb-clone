from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session

from . import models
from .database import Base, engine, get_db
from .schemas import (
    BookingCreate,
    BookingResponse,
    ListingCreate,
    ListingResponse,
    ListingUpdate,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Airbnb Clone API")

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
    db: Session = Depends(get_db),
):
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
    booking = models.Booking(
        listing_id=listing.id,
        check_in=booking_data.check_in,
        check_out=booking_data.check_out,
        guest_count=booking_data.guest_count,
        total_price=listing.price_per_night * nights,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


@app.get("/bookings", response_model=list[BookingResponse])
def get_bookings(db: Session = Depends(get_db)):
    return db.query(models.Booking).order_by(models.Booking.created_at.desc()).all()
