from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class UserResponse(BaseModel):
    id: int
    display_name: str
    role: Literal["guest", "host"]

    model_config = ConfigDict(from_attributes=True)


class ListingHostSummary(BaseModel):
    id: int
    display_name: str

    model_config = ConfigDict(from_attributes=True)


class ListingWrite(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    price_per_night: float = Field(gt=0, allow_inf_nan=False)
    category: str = Field(min_length=1, max_length=100)
    image_url: str = Field(min_length=1, max_length=500)
    max_guests: int = Field(gt=0, le=100)
    host_id: int = Field(gt=0)

    model_config = ConfigDict(extra="forbid")

    @field_validator("title", "location", "description", "category", "image_url")
    @classmethod
    def require_non_whitespace(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class ListingCreate(ListingWrite):
    pass


class ListingUpdate(ListingWrite):
    pass


class ListingResponse(BaseModel):
    id: int
    title: str
    location: str
    description: str
    price_per_night: float
    rating: float
    category: str
    image_url: str
    max_guests: int

    host_id: int | None = None
    host: ListingHostSummary | None = None

    model_config = ConfigDict(from_attributes=True)


class BookingCreate(BaseModel):
    listing_id: int
    check_in: date
    check_out: date
    guest_count: int = Field(gt=0)
    guest_id: int = Field(gt=0)

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_date_range(self):
        if self.check_out <= self.check_in:
            raise ValueError("Check-out date must be after check-in date.")
        return self


class BookingListingSummary(BaseModel):
    id: int
    title: str
    location: str

    model_config = ConfigDict(from_attributes=True)


class BookingDateRange(BaseModel):
    check_in: date
    check_out: date

    model_config = ConfigDict(from_attributes=True)


class BookingResponse(BaseModel):
    id: int
    listing_id: int
    listing: BookingListingSummary
    guest_id: int | None = None
    check_in: date
    check_out: date
    guest_count: int
    total_price: float
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)