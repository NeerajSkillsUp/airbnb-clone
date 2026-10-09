"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  appendUniqueListings,
  PaginationRequestGuard,
} from "./pagination-requests.mjs";

const categories = [
  { name: "All homes", icon: "⌂" },
  { name: "Amazing views", icon: "▧" },
  { name: "Cabins", icon: "⌁" },
  { name: "Beachfront", icon: "♧" },
  { name: "Tiny homes", icon: "⌑" },
  { name: "Design", icon: "◇" },
  { name: "Countryside", icon: "♧" },
  { name: "Lakefront", icon: "≋" },
  { name: "Castles", icon: "♜" },
  { name: "OMG!", icon: "✧" },
];

const PAGE_SIZE = 8;

type SearchFilters = {
  search: string;
  checkIn: string;
  checkOut: string;
  guests: string;
};

type ApiListing = {
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

function isApiListing(value: unknown): value is ApiListing {
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

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState("All homes");
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestInput, setGuestInput] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<SearchFilters>({
    search: "",
    checkIn: "",
    checkOut: "",
    guests: "",
  });
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const paginationRequests = useRef(new PaginationRequestGuard());
  const nextPageOffset = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");

    async function fetchListings() {
      setIsLoading(true);
      setError(null);
      setLoadMoreError(null);
      setHasMore(true);

      if (!apiUrl) {
        setError("The listings API URL is not configured. Set NEXT_PUBLIC_API_URL and try again.");
        setIsLoading(false);
        return;
      }

      try {
        const searchParams = new URLSearchParams();
        searchParams.set("limit", String(PAGE_SIZE));
        if (appliedFilters.search) {
          searchParams.set("search", appliedFilters.search);
        }
        if (appliedFilters.checkIn) {
          searchParams.set("check_in", appliedFilters.checkIn);
          searchParams.set("check_out", appliedFilters.checkOut);
        }
        if (appliedFilters.guests) {
          searchParams.set("guests", appliedFilters.guests);
        }
        const queryString = searchParams.toString();
        const response = await fetch(
          `${apiUrl}/listings${queryString ? `?${queryString}` : ""}`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error(`The listings service returned an error (${response.status}).`);
        }

        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isApiListing)) {
          throw new Error("The listings service returned data in an unexpected format.");
        }

        setListings(data);
        nextPageOffset.current = data.length;
        setHasMore(data.length === PAGE_SIZE);
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          fetchError instanceof Error
            ? `${fetchError.message} Check that the backend is running and try again.`
            : "Unable to load stays. Check that the backend is running and try again.",
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void fetchListings();
    return () => controller.abort();
  }, [appliedFilters, retryCount]);

  function invalidatePaginationRequests() {
    paginationRequests.current.invalidate();
    nextPageOffset.current = 0;
    setIsLoadingMore(false);
    setLoadMoreError(null);
  }

  async function loadMoreListings() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
    if (!apiUrl || !hasMore) {
      return;
    }

    const request = paginationRequests.current.begin();
    if (!request) {
      return;
    }
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const searchParams = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(nextPageOffset.current),
      });
      if (appliedFilters.search) {
        searchParams.set("search", appliedFilters.search);
      }
      if (appliedFilters.checkIn) {
        searchParams.set("check_in", appliedFilters.checkIn);
        searchParams.set("check_out", appliedFilters.checkOut);
      }
      if (appliedFilters.guests) {
        searchParams.set("guests", appliedFilters.guests);
      }

      const response = await fetch(`${apiUrl}/listings?${searchParams.toString()}`);
      if (!response.ok) {
        throw new Error(`The listings service returned an error (${response.status}).`);
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data) || !data.every(isApiListing)) {
        throw new Error("The listings service returned data in an unexpected format.");
      }
      if (!paginationRequests.current.isCurrent(request)) {
        return;
      }
      nextPageOffset.current += data.length;
      setListings((currentListings) =>
        appendUniqueListings(currentListings, data),
      );
      setHasMore(data.length === PAGE_SIZE);
    } catch (fetchError) {
      if (paginationRequests.current.isCurrent(request)) {
        setLoadMoreError(
          fetchError instanceof Error
            ? `${fetchError.message} Try loading more stays again.`
            : "Unable to load more stays. Please try again.",
        );
      }
    } finally {
      if (paginationRequests.current.finish(request)) {
        setIsLoadingMore(false);
      }
    }
  }

  const categoryOptions = [
    ...categories,
    ...Array.from(new Set(listings.map((listing) => listing.category)))
      .filter((name) => !categories.some((category) => category.name === name))
      .map((name) => ({ name, icon: "⌂" })),
  ];

  const visibleListings =
    selectedCategory === "All homes"
      ? listings
      : listings.filter((listing) => listing.category === selectedCategory);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilterError(null);
    if (Boolean(checkIn) !== Boolean(checkOut)) {
      setFilterError("Select both check-in and check-out dates, or clear both.");
      return;
    }
    if (checkIn && checkOut && checkOut <= checkIn) {
      setFilterError("Check-out must be after check-in.");
      return;
    }
    if (
      guestInput &&
      (!Number.isInteger(Number(guestInput)) ||
        Number(guestInput) < 1 ||
        Number(guestInput) > 100)
    ) {
      setFilterError("Guest count must be a whole number between 1 and 100.");
      return;
    }
    invalidatePaginationRequests();
    setAppliedFilters({
      search: searchInput.trim(),
      checkIn,
      checkOut,
      guests: guestInput,
    });
  }

  function clearSearch() {
    invalidatePaginationRequests();
    setSearchInput("");
    setCheckIn("");
    setCheckOut("");
    setGuestInput("");
    setFilterError(null);
    setAppliedFilters({ search: "", checkIn: "", checkOut: "", guests: "" });
  }

  function toggleFavorite(id: number) {
    setFavorites((currentFavorites) => {
      const nextFavorites = new Set(currentFavorites);
      if (nextFavorites.has(id)) {
        nextFavorites.delete(id);
      } else {
        nextFavorites.add(id);
      }
      return nextFavorites;
    });
  }

  const hasSearchFilters = Boolean(
    searchInput ||
      checkIn ||
      checkOut ||
      guestInput ||
      appliedFilters.search ||
      appliedFilters.checkIn ||
      appliedFilters.guests,
  );

  const today = new Date();
  const todayString = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");

  return (
    <main className="min-h-screen bg-white text-[#222222]">
      <header className="border-b border-[#ebebeb]">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-5 lg:px-10">
          <a
            href="#explore"
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
          </a>

          <nav aria-label="Main navigation" className="hidden items-center gap-8 sm:flex">
            <a href="#explore" className="text-sm font-medium hover:text-black">
              Stays
            </a>
            <a href="#experiences" className="text-sm text-[#717171] hover:text-black">
              Experiences
            </a>
            <a href="#services" className="text-sm text-[#717171] hover:text-black">
              Services
            </a>
            <Link href="/trips" className="text-sm text-[#717171] hover:text-black">
              My Trips
            </Link>
            <Link href="/host" className="text-sm text-[#717171] hover:text-black">
              Host
            </Link>
          </nav>

          <button
            type="button"
            aria-label="Open profile and menu"
            className="flex items-center gap-3 rounded-full border border-[#dddddd] px-3 py-2 transition-shadow hover:shadow-md"
          >
            <span aria-hidden="true" className="text-base leading-none">
              ☰
            </span>
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-[#717171] text-sm text-white"
            >
              ●
            </span>
          </button>
        </div>

        <div className="px-5 pb-5 sm:pb-6">
          <form
            role="search"
            onSubmit={submitSearch}
            className="mx-auto flex max-w-[850px] flex-wrap items-center rounded-2xl border border-[#dddddd] bg-white py-2 pl-5 pr-2 shadow-[0_3px_12px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[0_5px_16px_rgba(0,0,0,0.12)] sm:flex-nowrap sm:rounded-full"
          >
            <label
              className={`min-w-0 px-2 sm:flex-1 sm:basis-0 sm:px-4 ${
                hasSearchFilters ? "basis-[calc(100%-3rem)]" : "basis-full"
              }`}
            >
              <span className="block text-xs font-semibold">Where</span>
              <input
                type="text"
                placeholder="Search destinations"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label="Search listings by destination or title"
                className="w-full truncate border-0 bg-transparent p-0 text-sm text-[#717171] outline-none placeholder:text-[#717171]"
              />
            </label>
            {hasSearchFilters && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search and stay filters"
                className="mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-[#717171] hover:bg-[#f7f7f7] hover:text-[#222222] sm:mr-2"
              >
                ×
              </button>
            )}
            <span aria-hidden="true" className="hidden h-8 border-l border-[#dddddd] sm:block" />
            <label className="basis-1/2 min-w-0 border-t border-[#ebebeb] px-2 pt-3 sm:flex-1 sm:basis-0 sm:border-t-0 sm:px-4 sm:pt-0">
              <span className="block text-xs font-semibold">Check in</span>
              <input
                type="date"
                value={checkIn}
                onChange={(event) => setCheckIn(event.target.value)}
                aria-label="Check-in date"
                min={todayString}
                max={checkOut || undefined}
                placeholder="Add dates"
                className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-[#717171] outline-none"
              />
            </label>
            <span aria-hidden="true" className="hidden h-8 border-l border-[#dddddd] sm:block" />
            <label className="basis-1/2 min-w-0 border-t border-[#ebebeb] px-2 pt-3 sm:flex-1 sm:basis-0 sm:border-t-0 sm:px-4 sm:pt-0">
              <span className="block text-xs font-semibold">Check out</span>
              <input
                type="date"
                value={checkOut}
                onChange={(event) => setCheckOut(event.target.value)}
                aria-label="Check-out date"
                min={checkIn || todayString}
                placeholder="Add dates"
                className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-[#717171] outline-none"
              />
            </label>
            <span aria-hidden="true" className="hidden h-8 border-l border-[#dddddd] sm:block" />
            <label className="min-w-0 basis-[calc(100%-3rem)] border-t border-[#ebebeb] px-2 pt-3 sm:flex-1 sm:basis-0 sm:border-t-0 sm:px-4 sm:pt-0">
              <span className="block text-xs font-semibold">Who</span>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={guestInput}
                onChange={(event) => setGuestInput(event.target.value)}
                aria-label="Number of guests"
                placeholder="Add guests"
                className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-[#717171] outline-none placeholder:text-[#717171]"
              />
            </label>
            <button
              type="submit"
              aria-label="Search stays"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#ff385c] text-xl text-white transition-colors hover:bg-[#e31c5f] sm:h-12 sm:w-12"
            >
              ⌕
            </button>
          </form>
        </div>
      </header>

      <section
        id="explore"
        aria-label="Browse stays by category"
        className="mx-auto max-w-[1440px] px-6 pt-5 lg:px-10"
      >
        <div className="flex gap-8 overflow-x-auto border-b border-[#ebebeb] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {categoryOptions.map((category) => {
            const isSelected = selectedCategory === category.name;
            return (
              <button
                key={category.name}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedCategory(category.name)}
                className={`group flex shrink-0 flex-col items-center gap-2 border-b-2 pb-3 text-xs font-medium transition-colors ${
                  isSelected
                    ? "border-[#222222] text-[#222222]"
                    : "border-transparent text-[#717171] hover:border-[#b0b0b0] hover:text-[#222222]"
                }`}
              >
                <span aria-hidden="true" className="text-[25px] leading-7">
                  {category.icon}
                </span>
                {category.name}
              </button>
            );
          })}
        </div>
      </section>

      <section
        aria-label="Available stays"
        className="mx-auto max-w-[1440px] px-6 pb-16 pt-7 lg:px-10 lg:pt-8"
      >
        {isLoading ? (
          <p role="status" className="py-16 text-center text-sm text-[#717171]">
            Loading stays…
          </p>
        ) : error ? (
          <div role="alert" className="py-16 text-center">
            <p className="text-sm text-[#717171]">{error}</p>
            <button
              type="button"
              onClick={() => setRetryCount((count) => count + 1)}
              className="mt-4 rounded-full bg-[#222222] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-black"
            >
              Try again
            </button>
          </div>
        ) : listings.length === 0 && appliedFilters.search ? (
          <div className="py-16 text-center">
            <p className="text-sm text-[#717171]">
              No stays match “{appliedFilters.search}”. Try another destination or title.
            </p>
            <button
              type="button"
              onClick={clearSearch}
              className="mt-4 rounded-full border border-[#222222] px-5 py-3 text-sm font-semibold transition-colors hover:bg-[#f7f7f7]"
            >
              Clear search
            </button>
          </div>
        ) : listings.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#717171]">
            No stays are available right now. Please check back soon.
          </p>
        ) : visibleListings.length === 0 ? (
          <p className="py-16 text-center text-sm text-[#717171]">
            {hasMore
              ? "No stays in this category have loaded yet. Load more to check additional results."
              : "No stays in this category just yet. Try another category."}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {visibleListings.map((listing) => {
              const isFavorite = favorites.has(listing.id);
              return (
                <article key={listing.id} className="min-w-0">
                  <div className="relative">
                    <Link
                      href={`/listings/${listing.id}`}
                      aria-label={`View ${listing.title} in ${listing.location}`}
                      className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#222222]"
                    >
                      <div className="relative aspect-[1/0.96] overflow-hidden rounded-xl bg-[#f2f2f2]">
                        <div
                          role="img"
                          aria-label={listing.title}
                          className="h-full w-full bg-cover bg-center transition-transform duration-300 hover:scale-[1.03]"
                          style={{ backgroundImage: `url("${listing.image_url}")` }}
                        />
                      </div>
                      <div className="mt-3 flex items-start justify-between gap-3">
                        <h2 className="truncate text-[15px] font-semibold">{listing.location}</h2>
                        {listing.rating != null && listing.rating > 0 ? (
                          <p className="flex shrink-0 items-center gap-1 text-sm">
                            <span aria-hidden="true">★</span>
                            {listing.rating}
                          </p>
                        ) : (
                          <p className="shrink-0 text-sm font-medium text-[#717171]">New</p>
                        )}
                      </div>
                      <p className="mt-1 truncate text-[15px] text-[#717171]">{listing.title}</p>
                      <p className="mt-2 text-[15px]">
                        <span className="font-semibold">${listing.price_per_night}</span>
                        <span className="text-[#222222]"> night</span>
                      </p>
                    </Link>
                    <button
                      type="button"
                      aria-label={
                        isFavorite
                          ? `Remove ${listing.location} from favorites`
                          : `Add ${listing.location} to favorites`
                      }
                      aria-pressed={isFavorite}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleFavorite(listing.id);
                      }}
                      className={`absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-[24px] leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] transition-transform hover:scale-110 ${
                        isFavorite ? "text-[#ff385c]" : ""
                      }`}
                    >
                      <span aria-hidden="true">{isFavorite ? "♥" : "♡"}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        {filterError && (
          <p role="alert" className="mt-5 text-center text-sm text-[#c13515]">
            {filterError}
          </p>
        )}
        {loadMoreError && (
          <p role="alert" className="mt-5 text-center text-sm text-[#c13515]">
            {loadMoreError}
          </p>
        )}
        {!isLoading && !error && listings.length > 0 && hasMore && (
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={() => void loadMoreListings()}
              disabled={isLoadingMore}
              aria-label="Load more available stays"
              className="rounded-full border border-[#222222] px-6 py-3 text-sm font-semibold transition-colors hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoadingMore ? "Loading more stays…" : "Load more"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
