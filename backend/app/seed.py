from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from .database import Base, SessionLocal, migrate_sqlite_ownership_columns
from .models import Booking, Listing, User


DEMO_USERS = (
    {"id": 1, "display_name": "Demo Guest", "role": "guest"},
    {"id": 2, "display_name": "Weekend Guest", "role": "guest"},
    {"id": 3, "display_name": "Alex Host", "role": "host"},
    {"id": 4, "display_name": "Jordan Host", "role": "host"},
)
DEFAULT_GUEST_ID = 1
DEFAULT_HOST_ID = 3

sample_listings = [
    {
        "title": "Amalfi Coast Villa with Sea Views",
        "location": "Amalfi, Italy",
        "description": "A beautiful coastal villa with panoramic Mediterranean views and a sunny terrace.",
        "price_per_night": 240.0,
        "rating": 4.98,
        "category": "Amazing views",
        "image_url": "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2",
        "max_guests": 4,
    },
    {
        "title": "Cozy Mountain Cabin",
        "location": "Asheville, North Carolina",
        "description": "A peaceful wooden cabin surrounded by mountain scenery, perfect for a quiet getaway.",
        "price_per_night": 180.0,
        "rating": 4.95,
        "category": "Cabins",
        "image_url": "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8",
        "max_guests": 4,
    },
    {
        "title": "Santorini Cliffside Escape",
        "location": "Santorini, Greece",
        "description": "A bright island retreat with whitewashed architecture and beautiful sea views.",
        "price_per_night": 310.0,
        "rating": 4.92,
        "category": "Amazing views",
        "image_url": "https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e",
        "max_guests": 2,
    },
    {
        "title": "Beachfront Tropical Hideaway",
        "location": "Tulum, Mexico",
        "description": "A relaxed tropical stay close to the beach, with open spaces and natural textures.",
        "price_per_night": 195.0,
        "rating": 4.89,
        "category": "Beachfront",
        "image_url": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
        "max_guests": 3,
    },
    {
        "title": "Desert Tiny Home",
        "location": "Joshua Tree, California",
        "description": "A compact modern hideaway in the desert, ideal for stargazing and peaceful evenings.",
        "price_per_night": 145.0,
        "rating": 4.90,
        "category": "Tiny homes",
        "image_url": "https://images.unsplash.com/photo-1510798831971-661eb04b3739",
        "max_guests": 2,
    },
    {
        "title": "Charming City Apartment",
        "location": "Lisbon, Portugal",
        "description": "A stylish city apartment near historic streets, cafes, and local attractions.",
        "price_per_night": 125.0,
        "rating": 4.87,
        "category": "Design",
        "image_url": "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0",
        "max_guests": 2,
    },
    {
        "title": "Lakefront Wooden Retreat",
        "location": "Lake Como, Italy",
        "description": "A serene lakeside home with beautiful scenery and room to unwind.",
        "price_per_night": 220.0,
        "rating": 4.96,
        "category": "Lakefront",
        "image_url": "https://images.unsplash.com/photo-1470770841072-f978cf4d019e",
        "max_guests": 5,
    },
    {
        "title": "Countryside Stone Cottage",
        "location": "Cotswolds, England",
        "description": "A traditional stone cottage in the countryside, perfect for a relaxing escape.",
        "price_per_night": 165.0,
        "rating": 4.91,
        "category": "Countryside",
        "image_url": "https://images.unsplash.com/photo-1449158743715-0a90ebb6d2d8",
        "max_guests": 4,
    },
]

sample_listing_host_ids = {
    "Amalfi Coast Villa with Sea Views": 3,
    "Cozy Mountain Cabin": 4,
    "Santorini Cliffside Escape": 3,
    "Beachfront Tropical Hideaway": 4,
    "Desert Tiny Home": 3,
    "Charming City Apartment": 4,
    "Lakefront Wooden Retreat": 3,
    "Countryside Stone Cottage": 4,
}


def seed_database(db: Session | None = None) -> None:
    owns_session = db is None
    if db is None:
        db = SessionLocal()

    try:
        migrate_sqlite_ownership_columns(db.get_bind())
        Base.metadata.create_all(bind=db.get_bind())

        for demo_user in DEMO_USERS:
            existing_user = db.get(User, demo_user["id"])
            if existing_user is None:
                db.add(User(**demo_user))
            elif (
                existing_user.display_name != demo_user["display_name"]
                or existing_user.role != demo_user["role"]
            ):
                raise ValueError(
                    f"Demo identity ID {demo_user['id']} is already in use."
                )
        db.flush()

        existing_count = db.query(Listing).count()

        if existing_count == 0:
            listings = [
                Listing(
                    **listing,
                    host_id=sample_listing_host_ids[listing["title"]],
                )
                for listing in sample_listings
            ]
            db.add_all(listings)
            db.flush()

            listings_by_title = {listing.title: listing for listing in listings}
            today = date.today()
            sample_bookings = [
                ("Amalfi Coast Villa with Sea Views", 45, 3, 2),
                ("Cozy Mountain Cabin", 65, 2, 3),
                ("Charming City Apartment", 85, 4, 2),
            ]
            for title, start_offset, nights, guest_count in sample_bookings:
                listing = listings_by_title[title]
                subtotal = Decimal(str(listing.price_per_night)) * nights
                service_fee = (subtotal * Decimal("0.10")).quantize(
                    Decimal("0.01"),
                    rounding=ROUND_HALF_UP,
                )
                total_price = subtotal + Decimal("35.00") + service_fee
                check_in = today + timedelta(days=start_offset)
                db.add(
                    Booking(
                        listing=listing,
                        guest_id=DEFAULT_GUEST_ID,
                        check_in=check_in,
                        check_out=check_in + timedelta(days=nights),
                        guest_count=guest_count,
                        total_price=float(total_price),
                    )
                )
        else:
            print(
                f"Database already has {existing_count} listings. "
                "No sample listings or bookings added."
            )

        for listing in db.query(Listing).filter(Listing.host_id.is_(None)):
            listing.host_id = sample_listing_host_ids.get(
                listing.title,
                DEFAULT_HOST_ID,
            )
        for booking in db.query(Booking).filter(Booking.guest_id.is_(None)):
            booking.guest_id = DEFAULT_GUEST_ID

        db.commit()
        if existing_count == 0:
            print(
                f"Successfully added {len(sample_listings)} sample listings and "
                "3 sample bookings."
            )
    except Exception:
        db.rollback()
        raise
    finally:
        if owns_session:
            db.close()


if __name__ == "__main__":
    seed_database()
