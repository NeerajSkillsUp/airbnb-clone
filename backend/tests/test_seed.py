import unittest
from datetime import timedelta

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import models
from app.database import Base, migrate_sqlite_ownership_columns
from app.main import get_listings
from app.seed import DEMO_USERS, sample_listings, seed_database


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
        self.assertEqual(len(DEMO_USERS), self.session.query(models.User).count())
        self.assertTrue(
            all(listing.host_id is not None for listing in self.session.query(models.Listing))
        )
        self.assertTrue(
            all(booking.guest_id is not None for booking in self.session.query(models.Booking))
        )
        amalfi = self.session.query(models.Listing).filter_by(
            title="Amalfi Coast Villa with Sea Views"
        ).one()
        cabin = self.session.query(models.Listing).filter_by(
            title="Cozy Mountain Cabin"
        ).one()
        self.assertEqual(3, amalfi.host_id)
        self.assertEqual(4, cabin.host_id)
        self.assertTrue(
            all(booking.guest_id == 1 for booking in self.session.query(models.Booking))
        )
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
        preserved_host_id = seeded_listing.host_id
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
                host_id=4,
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
        self.assertEqual(preserved_host_id, seeded_listing.host_id)
        self.assertIsNotNone(
            self.session.get(models.Booking, seeded_booking.id),
        )
        user_listing = self.session.query(models.Listing).filter_by(
            title="User-created listing"
        ).first()
        self.assertIsNotNone(user_listing)
        self.assertEqual(4, user_listing.host_id)

    def test_legacy_sqlite_schema_migrates_and_backfills_without_losing_rows(self):
        legacy_engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
        )
        try:
            with legacy_engine.begin() as connection:
                connection.execute(text(
                    "CREATE TABLE listings ("
                    "id INTEGER PRIMARY KEY, title VARCHAR(200) NOT NULL, "
                    "location VARCHAR(200) NOT NULL, description TEXT NOT NULL, "
                    "price_per_night FLOAT NOT NULL, rating FLOAT, "
                    "category VARCHAR(100) NOT NULL, image_url VARCHAR(500) NOT NULL, "
                    "max_guests INTEGER NOT NULL)"
                ))
                connection.execute(text(
                    "CREATE TABLE bookings ("
                    "id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL, "
                    "check_in DATE NOT NULL, check_out DATE NOT NULL, "
                    "guest_count INTEGER NOT NULL, total_price FLOAT NOT NULL, "
                    "created_at DATETIME NOT NULL)"
                ))
                connection.execute(text(
                    "INSERT INTO listings VALUES "
                    "(71, 'Existing listing', 'Existing City', 'Keep this text', "
                    "123.0, 4.5, 'Existing category', 'https://example.com/old.jpg', 3)"
                ))
                connection.execute(text(
                    "INSERT INTO bookings VALUES "
                    "(81, 71, '2030-09-01', '2030-09-03', 2, 306.6, "
                    "'2030-01-01 12:00:00')"
                ))

            migrate_sqlite_ownership_columns(legacy_engine)
            Base.metadata.create_all(bind=legacy_engine)
            legacy_session = sessionmaker(bind=legacy_engine)()
            try:
                seed_database(legacy_session)
                listing = legacy_session.get(models.Listing, 71)
                booking = legacy_session.get(models.Booking, 81)
                self.assertIsNotNone(listing)
                self.assertEqual("Keep this text", listing.description)
                self.assertEqual(3, listing.max_guests)
                self.assertEqual(3, listing.host_id)
                self.assertIsNotNone(booking)
                self.assertEqual(306.6, booking.total_price)
                self.assertEqual(1, booking.guest_id)
                self.assertEqual(1, legacy_session.query(models.Listing).count())
                self.assertEqual(1, legacy_session.query(models.Booking).count())
            finally:
                legacy_session.close()
        finally:
            legacy_engine.dispose()

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
            host_id=None,
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
            host_id=None,
            db=self.session,
        )

        self.assertNotIn(booking.listing_id, [listing.id for listing in available])
        self.assertIn(booking.listing_id, [listing.id for listing in back_to_back])


if __name__ == "__main__":
    unittest.main()
