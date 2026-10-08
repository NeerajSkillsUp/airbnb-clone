import unittest
from datetime import date

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.main import create_booking, get_listing_availability, get_listings
from app.schemas import BookingCreate


class ListingSearchTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.amalfi = self.add_listing(
            "Amalfi Villa",
            "Amalfi, Italy",
            max_guests=4,
            price_per_night=200,
        )
        self.cabin = self.add_listing(
            "Quiet Cabin",
            "Asheville, North Carolina",
            max_guests=2,
            price_per_night=99.99,
        )
        self.add_booking(self.amalfi.id, date(2030, 6, 10), date(2030, 6, 13))

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def add_listing(
        self,
        title: str,
        location: str,
        *,
        max_guests: int,
        price_per_night: float,
    ) -> models.Listing:
        listing = models.Listing(
            title=title,
            location=location,
            description="Test listing",
            price_per_night=price_per_night,
            rating=4.9,
            category="Test",
            image_url="https://example.com/photo.jpg",
            max_guests=max_guests,
        )
        self.session.add(listing)
        self.session.commit()
        self.session.refresh(listing)
        return listing

    def add_booking(self, listing_id: int, check_in: date, check_out: date) -> None:
        self.session.add(
            models.Booking(
                listing_id=listing_id,
                check_in=check_in,
                check_out=check_out,
                guest_count=1,
                total_price=100,
            )
        )
        self.session.commit()

    def search(
        self,
        *,
        search: str | None = None,
        location: str | None = None,
        guests: int | None = None,
        check_in: date | None = None,
        check_out: date | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[models.Listing]:
        return get_listings(
            search=search,
            location=location,
            guests=guests,
            check_in=check_in,
            check_out=check_out,
            limit=limit,
            offset=offset,
            db=self.session,
        )

    def test_omitted_filters_preserve_unpaginated_listing_response(self):
        results = self.search()

        self.assertEqual([self.amalfi.id, self.cabin.id], [item.id for item in results])

    def test_existing_search_matches_title_and_location(self):
        title_results = self.search(search="villa")
        location_results = self.search(search="NORTH CAROLINA")

        self.assertEqual([self.amalfi.id], [item.id for item in title_results])
        self.assertEqual([self.cabin.id], [item.id for item in location_results])

    def test_location_filter_and_guest_capacity(self):
        results = self.search(location="amalfi", guests=3)

        self.assertEqual([self.amalfi.id], [item.id for item in results])
        self.assertEqual([], self.search(location="amalfi", guests=5))

    def test_availability_filter_excludes_overlapping_bookings(self):
        overlapping = self.search(
            check_in=date(2030, 6, 12),
            check_out=date(2030, 6, 14),
        )
        back_to_back = self.search(
            check_in=date(2030, 6, 13),
            check_out=date(2030, 6, 15),
        )

        self.assertEqual([self.cabin.id], [item.id for item in overlapping])
        self.assertEqual(
            [self.amalfi.id, self.cabin.id],
            [item.id for item in back_to_back],
        )

    def test_availability_filter_rejects_missing_or_reversed_dates(self):
        with self.assertRaises(HTTPException) as missing_date:
            self.search(check_in=date(2030, 6, 10))
        self.assertEqual(422, missing_date.exception.status_code)

        with self.assertRaises(HTTPException) as reversed_dates:
            self.search(
                check_in=date(2030, 6, 15),
                check_out=date(2030, 6, 14),
            )
        self.assertEqual(422, reversed_dates.exception.status_code)

    def test_invalid_guest_count_and_pagination_values_are_rejected(self):
        with self.assertRaises(HTTPException) as invalid_guests:
            self.search(guests=0)
        self.assertEqual(422, invalid_guests.exception.status_code)

        with self.assertRaises(HTTPException) as invalid_limit:
            self.search(limit=101)
        self.assertEqual(422, invalid_limit.exception.status_code)

        with self.assertRaises(HTTPException) as invalid_offset:
            self.search(offset=-1)
        self.assertEqual(422, invalid_offset.exception.status_code)

    def test_limit_and_offset_paginate_in_stable_id_order(self):
        first_page = self.search(limit=1)
        second_page = self.search(limit=1, offset=1)

        self.assertEqual([self.amalfi.id], [item.id for item in first_page])
        self.assertEqual([self.cabin.id], [item.id for item in second_page])

    def test_availability_endpoint_returns_only_booked_date_ranges(self):
        ranges = get_listing_availability(self.amalfi.id, db=self.session)

        self.assertEqual(
            [(date(2030, 6, 10), date(2030, 6, 13))],
            [(item.check_in, item.check_out) for item in ranges],
        )

    def test_booking_total_includes_server_calculated_fees(self):
        booking = create_booking(
            BookingCreate(
                listing_id=self.cabin.id,
                check_in=date(2030, 7, 1),
                check_out=date(2030, 7, 2),
                guest_count=2,
            ),
            db=self.session,
        )

        self.assertEqual(144.99, booking.total_price)

    def test_booking_overlap_remains_server_rejected(self):
        with self.assertRaises(HTTPException) as conflict:
            create_booking(
                BookingCreate(
                    listing_id=self.amalfi.id,
                    check_in=date(2030, 6, 12),
                    check_out=date(2030, 6, 14),
                    guest_count=1,
                ),
                db=self.session,
            )

        self.assertEqual(409, conflict.exception.status_code)


if __name__ == "__main__":
    unittest.main()
