import unittest
from datetime import timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base
from app.main import get_listings
from app.seed import sample_listings, seed_database


class SeedDatabaseTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )
        Base.metadata.create_all(bind=self.engine)
        self.session = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def test_empty_database_gets_sample_listings_and_bookings(self):
        seed_database(self.session)

        self.assertEqual(len(sample_listings), self.session.query(models.Listing).count())
        self.assertEqual(3, self.session.query(models.Booking).count())
        self.assertGreaterEqual(
            len({listing["category"] for listing in sample_listings}),
            5,
        )
        self.assertTrue(
            all(listing["image_url"].startswith("https://images.unsplash.com/")
                for listing in sample_listings)
        )

    def test_repeated_seed_preserves_existing_and_user_data(self):
        seed_database(self.session)
        seeded_listing = self.session.query(models.Listing).first()
        seeded_booking = self.session.query(models.Booking).first()
        seeded_listing.title = "User-edited title"
        self.session.add(
            models.Listing(
                title="User-created listing",
                location="Local City",
                description="Created by a user",
                price_per_night=99,
                rating=0,
                category="Design",
                image_url="https://example.com/user.jpg",
                max_guests=2,
            )
        )
        self.session.commit()
        before_listing_count = self.session.query(models.Listing).count()
        before_booking_count = self.session.query(models.Booking).count()

        seed_database(self.session)

        self.assertEqual(
            before_listing_count,
            self.session.query(models.Listing).count(),
        )
        self.assertEqual(
            before_booking_count,
            self.session.query(models.Booking).count(),
        )
        self.assertEqual("User-edited title", seeded_listing.title)
        self.assertIsNotNone(
            self.session.get(models.Booking, seeded_booking.id),
        )
        self.assertIsNotNone(
            self.session.query(models.Listing)
            .filter_by(title="User-created listing")
            .first()
        )

    def test_sample_bookings_make_seeded_dates_unavailable(self):
        seed_database(self.session)
        booking = self.session.query(models.Booking).first()

        available = get_listings(
            search=None,
            location=None,
            guests=None,
            check_in=booking.check_in,
            check_out=booking.check_out,
            limit=None,
            offset=0,
            db=self.session,
        )
        back_to_back = get_listings(
            search=None,
            location=None,
            guests=None,
            check_in=booking.check_out,
            check_out=booking.check_out + timedelta(days=1),
            limit=None,
            offset=0,
            db=self.session,
        )

        self.assertNotIn(booking.listing_id, [listing.id for listing in available])
        self.assertIn(booking.listing_id, [listing.id for listing in back_to_back])


if __name__ == "__main__":
    unittest.main()
