import unittest
from datetime import date

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.main import (
    create_booking,
    create_listing,
    delete_listing,
    get_bookings,
    get_host_bookings,
    get_listing_availability,
    get_listings,
    get_users,
    update_listing,
)
from app.schemas import BookingCreate, ListingCreate, ListingResponse, ListingUpdate


class ListingSearchTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.guest = models.User(display_name="Guest", role="guest")
        self.other_guest = models.User(display_name="Other guest", role="guest")
        self.host = models.User(display_name="Host", role="host")
        self.other_host = models.User(display_name="Other host", role="host")
        self.session.add_all(
            [self.guest, self.other_guest, self.host, self.other_host]
        )
        self.session.commit()
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
        host_id: int | None = None,
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
            host_id=host_id if host_id is not None else self.host.id,
        )
        self.session.add(listing)
        self.session.commit()
        self.session.refresh(listing)
        return listing

    def add_booking(
        self,
        listing_id: int,
        check_in: date,
        check_out: date,
        guest_id: int | None = None,
    ) -> None:
        self.session.add(
            models.Booking(
                listing_id=listing_id,
                guest_id=guest_id if guest_id is not None else self.guest.id,
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
            host_id=None,
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

    def test_listing_filter_returns_only_selected_hosts_properties(self):
        other_listing = self.add_listing(
            "Other host property",
            "Other City",
            max_guests=2,
            price_per_night=80,
            host_id=self.other_host.id,
        )

        results = get_listings(
            search=None,
            location=None,
            guests=None,
            check_in=None,
            check_out=None,
            limit=None,
            offset=0,
            host_id=self.other_host.id,
            db=self.session,
        )

        self.assertEqual([other_listing.id], [item.id for item in results])

    def test_listing_response_includes_related_host_display_name(self):
        response = ListingResponse.model_validate(self.amalfi)

        self.assertIsNotNone(response.host)
        self.assertEqual(self.host.id, response.host.id)
        self.assertEqual("Host", response.host.display_name)

    def test_users_can_be_selected_by_role_and_host_can_create_listing(self):
        self.assertEqual(
            [self.host.id, self.other_host.id],
            [user.id for user in get_users(role="host", db=self.session)],
        )
        created = create_listing(
            ListingCreate(
                title="Host-owned listing",
                location="Host City",
                description="Created by a selected host",
                price_per_night=150,
                category="Design",
                image_url="https://example.com/host.jpg",
                max_guests=3,
                host_id=self.other_host.id,
            ),
            db=self.session,
        )
        self.assertEqual(self.other_host.id, created.host_id)

    def test_bookings_are_filtered_by_guest_and_host_listing(self):
        other_listing = self.add_listing(
            "Other host property",
            "Other City",
            max_guests=2,
            price_per_night=80,
            host_id=self.other_host.id,
        )
        self.add_booking(other_listing.id, date(2030, 8, 1), date(2030, 8, 2), self.other_guest.id)
        guest_bookings = get_bookings(guest_id=self.other_guest.id, db=self.session)
        host_bookings = get_host_bookings(self.other_host.id, db=self.session)

        self.assertEqual([other_listing.id], [item.listing_id for item in guest_bookings])
        self.assertEqual([other_listing.id], [item.listing_id for item in host_bookings])

    def test_booking_requires_and_persists_a_guest_identity(self):
        booking = create_booking(
            BookingCreate(
                listing_id=self.cabin.id,
                check_in=date(2030, 7, 1),
                check_out=date(2030, 7, 2),
                guest_count=2,
                guest_id=self.other_guest.id,
            ),
            db=self.session,
        )

        self.assertEqual(self.other_guest.id, booking.guest_id)

    def test_host_cannot_update_or_delete_another_hosts_listing(self):
        payload = ListingUpdate(
            title=self.amalfi.title,
            location=self.amalfi.location,
            description=self.amalfi.description,
            price_per_night=self.amalfi.price_per_night,
            category=self.amalfi.category,
            image_url=self.amalfi.image_url,
            max_guests=self.amalfi.max_guests,
            host_id=self.other_host.id,
        )
        with self.assertRaises(HTTPException) as update_error:
            update_listing(self.amalfi.id, payload, db=self.session)
        self.assertEqual(403, update_error.exception.status_code)

        with self.assertRaises(HTTPException) as delete_error:
            delete_listing(
                self.amalfi.id,
                host_id=self.other_host.id,
                db=self.session,
            )
        self.assertEqual(403, delete_error.exception.status_code)

    def test_booking_rejects_a_host_identity_as_guest(self):
        with self.assertRaises(HTTPException) as error:
            create_booking(
                BookingCreate(
                    listing_id=self.cabin.id,
                    check_in=date(2030, 7, 1),
                    check_out=date(2030, 7, 2),
                    guest_count=1,
                    guest_id=self.host.id,
                ),
                db=self.session,
            )
        self.assertEqual(403, error.exception.status_code)

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
                guest_id=self.guest.id,
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
                    guest_id=self.guest.id,
                ),
                db=self.session,
            )

        self.assertEqual(409, conflict.exception.status_code)


if __name__ == "__main__":
    unittest.main()
