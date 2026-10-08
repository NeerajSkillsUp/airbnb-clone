"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Booking = {
  id: number;
  listing_id: number;
  listing: {
    id: number;
    title: string;
    location: string;
  };
  check_in: string;
  check_out: string;
  guest_count: number;
  total_price: number;
  created_at: string;
};

function isBooking(value: unknown): value is Booking {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const booking = value as Record<string, unknown>;
  if (typeof booking.listing !== "object" || booking.listing === null) {
    return false;
  }

  const listing = booking.listing as Record<string, unknown>;
  return (
    typeof booking.id === "number" &&
    typeof booking.listing_id === "number" &&
    typeof listing.id === "number" &&
    typeof listing.title === "string" &&
    typeof listing.location === "string" &&
    typeof booking.check_in === "string" &&
    typeof booking.check_out === "string" &&
    typeof booking.guest_count === "number" &&
    typeof booking.total_price === "number" &&
    typeof booking.created_at === "string"
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

export default function TripsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

    async function fetchBookings() {
      setIsLoading(true);
      setError(null);

      if (!apiUrl) {
        setError("The bookings API URL is not configured. Set NEXT_PUBLIC_API_URL and try again.");
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/bookings`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`The bookings service returned an error (${response.status}).`);
        }

        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isBooking)) {
          throw new Error("The bookings service returned data in an unexpected format.");
        }
        setBookings(data);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          fetchError instanceof Error
            ? `${fetchError.message} Check that the backend is running and try again.`
            : "Unable to load trips. Check that the backend is running and try again.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchBookings();
    return () => controller.abort();
  }, [retryCount]);

  return (
    <main className="min-h-screen bg-white text-[#222222]">
      <header className="border-b border-[#ebebeb]">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-5 lg:px-10">
          <Link
            href="/"
            aria-label="Airbnb home"
            className="flex items-center gap-2 text-[#ff385c]"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 32 32"
              className="h-8 w-8 fill-current"
            >
              <path d="M16 2.7c-2.1 0-3.7 1.5-5.2 4.2C7.7 12.2 3.4 21.4 3.4 25.2c0 3.3 2.5 5.3 5.5 5.3 2.2 0 4.7-1.4 7.1-4.5 2.4 3.1 4.9 4.5 7.1 4.5 3 0 5.5-2 5.5-5.3 0-3.8-4.3-13-7.4-18.3C19.7 4.2 18.1 2.7 16 2.7Zm0 20.5c-1.2-1.6-2.2-3.3-2.2-4.8 0-1.3.9-2.3 2.2-2.3s2.2 1 2.2 2.3c0 1.5-1 3.2-2.2 4.8Zm-7.1 4.4c-1.6 0-2.5-.9-2.5-2.4 0-2.4 2.7-8.7 5.3-13.8-.7 2.6-.4 4.4 1.4 6.1-1.1 2.4-2.2 4.2-3.5 6.3-.8 1.3-1.4 2.2-2.5 2.2h-.2Zm16.4 0c-1.1 0-1.7-.9-2.5-2.2-1.3-2.1-2.4-3.9-3.5-6.3 1.8-1.7 2.1-3.5 1.4-6.1 2.6 5.1 5.3 11.4 5.3 13.8 0 1.5-.9 2.4-2.5 2.4h-.2Z" />
            </svg>
            <span className="hidden text-[22px] font-bold tracking-[-1.1px] sm:inline">
              airbnb
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold hover:bg-[#f7f7f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
          >
            <span aria-hidden="true" className="text-lg">
              ←
            </span>
            Explore stays
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1120px] px-6 py-9 lg:px-10 lg:py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">My trips</h1>
        <p className="mt-3 max-w-2xl rounded-xl bg-[#f7f7f7] px-4 py-3 text-sm leading-6 text-[#717171]">
          Demo view: these are all bookings returned by the API. This app does not yet have
          accounts, so bookings are not associated with a specific user.
        </p>

        {isLoading ? (
          <p role="status" className="py-20 text-center text-sm text-[#717171]">
            Loading your trips…
          </p>
        ) : error ? (
          <div role="alert" className="py-20 text-center">
            <p className="text-sm text-[#717171]">{error}</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="mt-5 rounded-full bg-[#222222] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Try again
            </button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="py-20 text-center">
            <h2 className="text-xl font-semibold">No trips booked yet</h2>
            <p className="mt-2 text-sm text-[#717171]">
              Once a reservation is made, it will appear here.
            </p>
            <Link
              href="/"
              className="mt-5 inline-flex rounded-full bg-[#222222] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Explore stays
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            {bookings.map((booking) => (
              <article
                key={booking.id}
                className="rounded-2xl border border-[#dddddd] p-5 shadow-[0_3px_12px_rgba(0,0,0,0.05)] sm:p-6"
              >
                <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#717171]">
                      Reservation #{booking.id}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">
                      {booking.listing.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#717171]">{booking.listing.location}</p>
                  </div>
                  <Link
                    href={`/listings/${booking.listing.id}`}
                    className="inline-flex w-fit shrink-0 rounded-full border border-[#222222] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[#f7f7f7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#222222]"
                  >
                    View property
                  </Link>
                </div>

                <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-[#ebebeb] pt-5 sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-[#717171]">Check-in</dt>
                    <dd className="mt-1 text-sm font-medium">{formatDate(booking.check_in)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#717171]">Check-out</dt>
                    <dd className="mt-1 text-sm font-medium">{formatDate(booking.check_out)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#717171]">Guests</dt>
                    <dd className="mt-1 text-sm font-medium">
                      {booking.guest_count} {booking.guest_count === 1 ? "guest" : "guests"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#717171]">Total price</dt>
                    <dd className="mt-1 text-sm font-semibold">
                      ${booking.total_price.toFixed(2)}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
