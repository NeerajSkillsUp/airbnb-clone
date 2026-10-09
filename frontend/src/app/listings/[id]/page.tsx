"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type Listing = {
  id: number;
  title: string;
  location: string;
  description: string;
  price_per_night: number;
  rating?: number | null;
  category: string;
  image_url: string;
  max_guests: number;
};

type BookingConfirmation = {
  id: number;
  check_in: string;
  check_out: string;
  guest_count: number;
  total_price: number;
};

type BookingDateRange = {
  check_in: string;
  check_out: string;
};

const CLEANING_FEE = 35;
const SERVICE_FEE_RATE = 0.1;

function isListing(value: unknown): value is Listing {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const listing = value as Record<string, unknown>;
  return (
    typeof listing.id === "number" &&
    typeof listing.title === "string" &&
    typeof listing.location === "string" &&
    typeof listing.description === "string" &&
    typeof listing.price_per_night === "number" &&
    (listing.rating === undefined ||
      listing.rating === null ||
      typeof listing.rating === "number") &&
    typeof listing.category === "string" &&
    typeof listing.image_url === "string" &&
    typeof listing.max_guests === "number"
  );
}

function isBookingDateRange(value: unknown): value is BookingDateRange {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const range = value as Record<string, unknown>;
  return (
    typeof range.check_in === "string" &&
    typeof range.check_out === "string"
  );
}

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
}

function isBookingConfirmation(value: unknown): value is BookingConfirmation {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const booking = value as Record<string, unknown>;
  return (
    typeof booking.id === "number" &&
    typeof booking.check_in === "string" &&
    typeof booking.check_out === "string" &&
    typeof booking.guest_count === "number" &&
    typeof booking.total_price === "number"
  );
}

function getApiErrorMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return null;
  }

  const detail = data.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    const messages = detail.flatMap((item: unknown) => {
      if (typeof item === "object" && item !== null && "msg" in item && typeof item.msg === "string") {
        return [item.msg];
      }
      return [];
    });
    return messages.length > 0 ? messages.join(" ") : null;
  }
  return null;
}

export default function ListingDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<Listing | null>(null);
  const [bookedRanges, setBookedRanges] = useState<BookingDateRange[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingConfirmation, setBookingConfirmation] =
    useState<BookingConfirmation | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const bookingInProgress = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

    async function fetchListing() {
      setIsLoading(true);
      setError(null);

      if (!apiUrl) {
        setError("The listings API URL is not configured. Set NEXT_PUBLIC_API_URL and try again.");
        setAvailabilityError("The listings API URL is not configured.");
        setIsLoading(false);
        setIsAvailabilityLoading(false);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/listings/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        });
        if (response.status === 404) {
          throw new Error("This listing could not be found.");
        }
        if (!response.ok) {
          throw new Error(`The listings service returned an error (${response.status}).`);
        }

        const data: unknown = await response.json();
        if (!isListing(data)) {
          throw new Error("The listings service returned data in an unexpected format.");
        }

        setListing(data);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }
        setListing(null);
        setError(
          fetchError instanceof Error
            ? `${fetchError.message} Check that the backend is running and try again.`
            : "Unable to load this stay. Check that the backend is running and try again.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    async function fetchAvailability() {
      setIsAvailabilityLoading(true);
      setAvailabilityError(null);

      if (!apiUrl) {
        setAvailabilityError("The listings API URL is not configured.");
        setIsAvailabilityLoading(false);
        return;
      }

      try {
        const response = await fetch(
          `${apiUrl}/listings/${encodeURIComponent(id)}/availability`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Availability service returned an error (${response.status}).`);
        }
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isBookingDateRange)) {
          throw new Error("Availability service returned data in an unexpected format.");
        }
        setBookedRanges(data);
      } catch (availabilityFetchError) {
        if (!controller.signal.aborted) {
          setAvailabilityError(
            availabilityFetchError instanceof Error
              ? availabilityFetchError.message
              : "Unable to load booked dates.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsAvailabilityLoading(false);
        }
      }
    }

    void fetchListing();
    void fetchAvailability();
    return () => controller.abort();
  }, [id, retryCount]);

  const nights =
    checkIn && checkOut
      ? (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) /
        (24 * 60 * 60 * 1000)
      : 0;
  const estimatedSubtotal =
    listing && nights > 0
      ? Math.round(listing.price_per_night * nights * 100) / 100
      : null;
  const estimatedServiceFee =
    estimatedSubtotal === null
      ? null
      : Math.round(estimatedSubtotal * SERVICE_FEE_RATE * 100) / 100;
  const estimatedTotal =
    estimatedSubtotal === null || estimatedServiceFee === null
      ? null
      : estimatedSubtotal + CLEANING_FEE + estimatedServiceFee;

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (bookingInProgress.current || !listing) {
      return;
    }

    if (!checkIn || !checkOut) {
      setBookingError("Select both a check-in and check-out date.");
      return;
    }
    if (Number.isNaN(Date.parse(checkIn)) || Number.isNaN(Date.parse(checkOut))) {
      setBookingError("Enter valid check-in and check-out dates.");
      return;
    }
    if (nights <= 0) {
      setBookingError("Check-out must be after check-in.");
      return;
    }
    if (
      bookedRanges.some(
        (range) => checkIn < range.check_out && checkOut > range.check_in,
      )
    ) {
      setBookingError("Those dates overlap an existing booking. Choose different dates.");
      return;
    }
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > listing.max_guests) {
      setBookingError(`Choose between 1 and ${listing.max_guests} guests.`);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
    if (!apiUrl) {
      setBookingError("The booking service is not configured. Please try again later.");
      return;
    }

    bookingInProgress.current = true;
    setIsBooking(true);
    setBookingError(null);
    setBookingConfirmation(null);

    try {
      const response = await fetch(`${apiUrl}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_id: listing.id,
          check_in: checkIn,
          check_out: checkOut,
          guest_count: guestCount,
        }),
      });

      const data: unknown = await response.json();
      if (!response.ok) {
        const detail = getApiErrorMessage(data);
        if (response.status === 409) {
          throw new Error(detail ?? "Those dates are unavailable. Please choose different dates.");
        }
        if (response.status === 422) {
          throw new Error(detail ?? "Please check your dates and guest count, then try again.");
        }
        if (response.status === 404) {
          throw new Error(detail ?? "This listing could not be found.");
        }
        throw new Error(detail ?? `The booking service returned an error (${response.status}).`);
      }
      if (!isBookingConfirmation(data)) {
        throw new Error("The booking service returned an unexpected confirmation. Please check your bookings before retrying.");
      }

      setBookingConfirmation(data);
      setBookedRanges((currentRanges) =>
        [...currentRanges, { check_in: data.check_in, check_out: data.check_out }].sort(
          (left, right) => left.check_in.localeCompare(right.check_in),
        ),
      );
    } catch (bookingRequestError) {
      setBookingError(
        bookingRequestError instanceof Error
          ? bookingRequestError.message
          : "Unable to complete this booking. Please try again.",
      );
    } finally {
      bookingInProgress.current = false;
      setIsBooking(false);
    }
  }

  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return (
    <main className="min-h-screen bg-white text-[#222222]">
      <header className="border-b border-[#ebebeb]">
        <div className="mx-auto flex max-w-[1120px] items-center px-6 py-5 lg:px-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-sm font-semibold hover:bg-[#f7f7f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
          >
            <span aria-hidden="true" className="text-lg">
              ←
            </span>
            Back to explore
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1120px] px-6 py-8 lg:px-10 lg:py-10">
        {isLoading ? (
          <p role="status" className="py-24 text-center text-sm text-[#717171]">
            Loading listing…
          </p>
        ) : error ? (
          <div role="alert" className="py-16 text-center">
            <h1 className="text-2xl font-semibold">We couldn’t load this stay</h1>
            <p className="mt-3 text-sm text-[#717171]">{error}</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="mt-6 rounded-full bg-[#222222] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Try again
            </button>
          </div>
        ) : listing ? (
          <>
            <div className="mb-5">
              <p className="text-sm font-medium text-[#717171]">{listing.category}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {listing.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <p className="font-medium">{listing.location}</p>
                {listing.rating != null && listing.rating > 0 ? (
                  <p className="flex items-center gap-1">
                    <span aria-hidden="true">★</span>
                    <span className="font-semibold">{listing.rating.toFixed(2)}</span>
                  </p>
                ) : (
                  <p className="text-[#717171]">No reviews yet</p>
                )}
              </div>
            </div>

            <div
              role="img"
              aria-label={listing.title}
              className="aspect-[4/3] w-full rounded-2xl bg-[#f2f2f2] bg-cover bg-center sm:aspect-[16/8]"
              style={{ backgroundImage: `url("${listing.image_url}")` }}
            />

            <div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,1fr)_320px] md:gap-12">
              <div>
                <h2 className="text-xl font-semibold">About this place</h2>
                <p className="mt-4 whitespace-pre-line text-[15px] leading-7 text-[#484848]">
                  {listing.description}
                </p>
                <div className="mt-7 border-t border-[#ebebeb] pt-6">
                  <p className="text-base font-semibold">
                    {listing.max_guests} {listing.max_guests === 1 ? "guest" : "guests"}
                  </p>
                  <p className="mt-1 text-sm text-[#717171]">Maximum occupancy</p>
                </div>
              </div>

              <aside className="h-fit rounded-2xl border border-[#dddddd] p-6 shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                <p className="text-xl">
                  <span className="font-semibold">${listing.price_per_night}</span>
                  <span className="text-sm text-[#717171]"> night</span>
                </p>
                {listing.rating != null && listing.rating > 0 ? (
                  <p className="mt-3 flex items-center gap-2 text-sm">
                    <span aria-hidden="true">★</span>
                    <span className="font-semibold">{listing.rating.toFixed(2)}</span>
                    <span className="text-[#717171]">· Guest favorite</span>
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-[#717171]">No reviews yet</p>
                )}

                <section
                  aria-labelledby="unavailable-dates-heading"
                  className="mt-5 border-t border-[#ebebeb] pt-4"
                >
                  <h2 id="unavailable-dates-heading" className="text-sm font-semibold">
                    Unavailable dates
                  </h2>
                  {isAvailabilityLoading ? (
                    <p role="status" className="mt-2 text-xs text-[#717171]">
                      Loading booked dates…
                    </p>
                  ) : availabilityError ? (
                    <p role="alert" className="mt-2 text-xs text-[#c13515]">
                      {availabilityError} The server will still validate availability when you
                      reserve.
                    </p>
                  ) : bookedRanges.length === 0 ? (
                    <p className="mt-2 text-xs text-[#717171]">No dates are currently booked.</p>
                  ) : (
                    <ul className="mt-2 space-y-1 text-xs text-[#717171]">
                      {bookedRanges.map((range) => (
                        <li key={`${range.check_in}-${range.check_out}`}>
                          {formatDate(range.check_in)} – {formatDate(range.check_out)}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {bookingConfirmation ? (
                  <div
                    role="status"
                    className="mt-6 rounded-xl bg-[#f0f8f2] p-4 text-sm text-[#245b35]"
                  >
                    <h2 className="font-semibold">Booking confirmed</h2>
                    <p className="mt-2">
                      {bookingConfirmation.check_in} to {bookingConfirmation.check_out}
                    </p>
                    <p className="mt-1">
                      {bookingConfirmation.guest_count}{" "}
                      {bookingConfirmation.guest_count === 1 ? "guest" : "guests"}
                    </p>
                    <p className="mt-2 font-semibold">
                      Total: ${bookingConfirmation.total_price.toFixed(2)}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={submitBooking} className="mt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold">Check-in</span>
                        <input
                          type="date"
                          required
                          min={todayString}
                          value={checkIn}
                          disabled={isBooking}
                          onChange={(event) => {
                            setCheckIn(event.target.value);
                            setBookingError(null);
                          }}
                          className="w-full rounded-lg border border-[#b0b0b0] px-2 py-3 text-sm disabled:bg-[#f7f7f7]"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold">Check-out</span>
                        <input
                          type="date"
                          required
                          min={checkIn || todayString}
                          value={checkOut}
                          disabled={isBooking}
                          onChange={(event) => {
                            setCheckOut(event.target.value);
                            setBookingError(null);
                          }}
                          className="w-full rounded-lg border border-[#b0b0b0] px-2 py-3 text-sm disabled:bg-[#f7f7f7]"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs font-semibold">Guests</span>
                      <select
                        value={guestCount}
                        disabled={isBooking}
                        onChange={(event) => {
                          setGuestCount(Number(event.target.value));
                          setBookingError(null);
                        }}
                        className="w-full rounded-lg border border-[#b0b0b0] bg-white px-3 py-3 text-sm disabled:bg-[#f7f7f7]"
                      >
                        {Array.from({ length: listing.max_guests }, (_, index) => index + 1).map(
                          (count) => (
                            <option key={count} value={count}>
                              {count} {count === 1 ? "guest" : "guests"}
                            </option>
                          ),
                        )}
                      </select>
                    </label>

                    {estimatedTotal !== null && estimatedSubtotal !== null &&
                      estimatedServiceFee !== null && nights > 0 && (
                      <div className="border-t border-[#ebebeb] pt-4 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-[#717171]">
                            ${listing.price_per_night} × {nights}{" "}
                            {nights === 1 ? "night" : "nights"}
                          </span>
                          <span className="font-medium">${estimatedSubtotal.toFixed(2)}</span>
                        </div>
                        <div className="mt-2 flex justify-between gap-3">
                          <span className="text-[#717171]">Cleaning fee</span>
                          <span className="font-medium">${CLEANING_FEE.toFixed(2)}</span>
                        </div>
                        <div className="mt-2 flex justify-between gap-3">
                          <span className="text-[#717171]">Service fee (10%)</span>
                          <span className="font-medium">${estimatedServiceFee.toFixed(2)}</span>
                        </div>
                        <div className="mt-3 flex justify-between gap-3 border-t border-[#ebebeb] pt-3">
                          <span className="font-semibold">Estimated total</span>
                          <span className="font-semibold">${estimatedTotal.toFixed(2)}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[#717171]">
                          Estimated total includes a $35 cleaning fee and a 10% service fee on
                          the nightly subtotal. The backend calculates and confirms the final
                          total.
                        </p>
                      </div>
                    )}

                    {bookingError && (
                      <p role="alert" className="text-sm text-[#c13515]">
                        {bookingError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={isBooking}
                      className="w-full rounded-lg bg-[#ff385c] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#e31c5f] disabled:cursor-not-allowed disabled:bg-[#d9a0ac]"
                    >
                      {isBooking ? "Requesting booking…" : "Reserve"}
                    </button>
                    <p className="text-center text-xs text-[#717171]">
                      You won’t be charged yet.
                    </p>
                  </form>
                )}
              </aside>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
