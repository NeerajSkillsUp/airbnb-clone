from datetime import datetime

from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Listing(Base):
    __tablename__ = "listings"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    location = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    price_per_night = Column(Float, nullable=False)
    rating = Column(Float, default=0.0)
    category = Column(String(100), nullable=False)
    image_url = Column(String(500), nullable=False)
    max_guests = Column(Integer, default=2, nullable=False)

    bookings = relationship("Booking", back_populates="listing")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    listing_id = Column(Integer, ForeignKey("listings.id"), nullable=False, index=True)
    check_in = Column(Date, nullable=False)
    check_out = Column(Date, nullable=False)
    guest_count = Column(Integer, nullable=False)
    total_price = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    listing = relationship("Listing", back_populates="bookings")