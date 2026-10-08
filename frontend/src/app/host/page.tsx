"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

type Listing = {
  id: number;
  title: string;
  location: string;
  description: string;
  price_per_night: number;
  rating: number;
  category: string;
  image_url: string;
  max_guests: number;
};

type ListingForm = {
  title: string;
  location: string;
  description: string;
  price_per_night: string;
  category: string;
  image_url: string;
  max_guests: string;
};

const emptyForm: ListingForm = {
  title: "",
  location: "",
  description: "",
  price_per_night: "",
  category: "",
  image_url: "",
  max_guests: "2",
};

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
    typeof listing.rating === "number" &&
    typeof listing.category === "string" &&
    typeof listing.image_url === "string" &&
    typeof listing.max_guests === "number"
  );
}

async function getErrorMessage(response: Response): Promise<string> {
  const data: unknown = await response.json().catch(() => null);
  if (typeof data === "object" && data !== null && "detail" in data) {
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
      if (messages.length > 0) {
        return messages.join(" ");
      }
    }
  }
  return `The listings service returned an error (${response.status}).`;
}

export default function HostPage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const requestInProgress = useRef(false);

  const loadListings = useCallback(async (signal?: AbortSignal): Promise<Listing[]> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
    if (!apiUrl) {
      throw new Error("The listings API URL is not configured. Set NEXT_PUBLIC_API_URL and try again.");
    }

    const response = await fetch(`${apiUrl}/listings`, { signal });
    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const data: unknown = await response.json();
    if (!Array.isArray(data) || !data.every(isListing)) {
      throw new Error("The listings service returned data in an unexpected format.");
    }
    return data;
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchListings() {
      try {
        const loadedListings = await loadListings(controller.signal);
        if (!controller.signal.aborted) {
          setListings(loadedListings);
          setLoadError(null);
          setIsLoading(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Unable to load listings. Check that the backend is running and try again.",
          );
          setIsLoading(false);
        }
      }
    }

    void fetchListings();
    return () => controller.abort();
  }, [loadListings, retryCount]);

  function updateField(field: keyof ListingForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFormError(null);
    setSuccessMessage(null);
  }

  function startEditing(listing: Listing) {
    setEditingId(listing.id);
    setForm({
      title: listing.title,
      location: listing.location,
      description: listing.description,
      price_per_night: String(listing.price_per_night),
      category: listing.category,
      image_url: listing.image_url,
      max_guests: String(listing.max_guests),
    });
    setFormError(null);
    setSuccessMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEditing() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setSuccessMessage(null);
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestInProgress.current) {
      return;
    }

    const price = Number(form.price_per_night);
    const maxGuests = Number(form.max_guests);
    if (!Number.isFinite(price) || price <= 0) {
      setFormError("Nightly price must be a number greater than zero.");
      return;
    }
    if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 100) {
      setFormError("Guest capacity must be a whole number between 1 and 100.");
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
    if (!apiUrl) {
      setFormError("The listings API URL is not configured. Set NEXT_PUBLIC_API_URL and try again.");
      return;
    }

    requestInProgress.current = true;
    setIsSaving(true);
    setFormError(null);
    setSuccessMessage(null);

    try {
      const payload = {
        title: form.title.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
        price_per_night: price,
        category: form.category.trim(),
        image_url: form.image_url.trim(),
        max_guests: maxGuests,
      };
      const response = await fetch(
        `${apiUrl}/listings${editingId === null ? "" : `/${editingId}`}`,
        {
          method: editingId === null ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      const savedListing: unknown = await response.json();
      if (!isListing(savedListing)) {
        throw new Error("The API saved the listing but returned an unexpected response.");
      }
      const refreshedListings = await loadListings();
      setListings(refreshedListings);
      setEditingId(null);
      setForm(emptyForm);
      setSuccessMessage(editingId === null ? "Listing created successfully." : "Listing updated successfully.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Unable to save the listing. Please try again.",
      );
    } finally {
      requestInProgress.current = false;
      setIsSaving(false);
    }
  }

  async function deleteListing(listing: Listing) {
    const confirmed = window.confirm(
      `Delete “${listing.title}”? This action cannot be undone.`,
    );
    if (!confirmed || requestInProgress.current) {
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
    if (!apiUrl) {
      setLoadError("The listings API URL is not configured. Set NEXT_PUBLIC_API_URL and try again.");
      return;
    }

    requestInProgress.current = true;
    setDeletingId(listing.id);
    setLoadError(null);
    setSuccessMessage(null);
    try {
      const response = await fetch(`${apiUrl}/listings/${listing.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      setListings((current) => current.filter((item) => item.id !== listing.id));
      if (editingId === listing.id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      setSuccessMessage("Listing deleted successfully.");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Unable to delete the listing. Please try again.",
      );
    } finally {
      requestInProgress.current = false;
      setDeletingId(null);
    }
  }

  const inputClassName =
    "mt-1 w-full rounded-lg border border-[#b0b0b0] bg-white px-3 py-3 text-sm outline-none focus:border-[#222222] focus:ring-1 focus:ring-[#222222] disabled:bg-[#f7f7f7]";
  const labelClassName = "block text-sm font-medium";

  return (
    <main className="min-h-screen bg-white text-[#222222]">
      <header className="border-b border-[#ebebeb]">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5 lg:px-10">
          <Link href="/" className="text-lg font-bold tracking-tight text-[#ff385c]">
            airbnb
          </Link>
          <Link
            href="/"
            className="rounded-full px-4 py-2 text-sm font-semibold hover:bg-[#f7f7f7]"
          >
            Explore stays
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-6 py-9 lg:px-10 lg:py-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Host dashboard</h1>
        <p className="mt-3 max-w-3xl rounded-xl bg-[#f7f7f7] px-4 py-3 text-sm leading-6 text-[#717171]">
          Demo host dashboard: listings are shared across this assignment. There is no host
          authentication or user-specific access control.
        </p>

        {successMessage && (
          <p role="status" className="mt-5 rounded-lg bg-[#f0f8f2] px-4 py-3 text-sm text-[#245b35]">
            {successMessage}
          </p>
        )}

        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          <section className="rounded-2xl border border-[#dddddd] p-5 shadow-[0_3px_12px_rgba(0,0,0,0.05)] sm:p-6">
            <h2 className="text-xl font-semibold">
              {editingId === null ? "Create a listing" : "Edit listing"}
            </h2>
            <p className="mt-2 text-sm text-[#717171]">
              Required information about the property.
            </p>

            <form onSubmit={submitForm} className="mt-6 space-y-4">
              <label className={labelClassName}>
                Title
                <input
                  required
                  maxLength={200}
                  value={form.title}
                  disabled={isSaving}
                  onChange={(event) => updateField("title", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className={labelClassName}>
                Location
                <input
                  required
                  maxLength={200}
                  value={form.location}
                  disabled={isSaving}
                  onChange={(event) => updateField("location", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className={labelClassName}>
                Description
                <textarea
                  required
                  maxLength={5000}
                  rows={4}
                  value={form.description}
                  disabled={isSaving}
                  onChange={(event) => updateField("description", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className={labelClassName}>
                  Nightly price ($)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.price_per_night}
                    disabled={isSaving}
                    onChange={(event) => updateField("price_per_night", event.target.value)}
                    className={inputClassName}
                  />
                </label>
                <label className={labelClassName}>
                  Maximum guests
                  <input
                    required
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={form.max_guests}
                    disabled={isSaving}
                    onChange={(event) => updateField("max_guests", event.target.value)}
                    className={inputClassName}
                  />
                </label>
              </div>
              <label className={labelClassName}>
                Category
                <input
                  required
                  maxLength={100}
                  value={form.category}
                  disabled={isSaving}
                  onChange={(event) => updateField("category", event.target.value)}
                  className={inputClassName}
                />
              </label>
              <label className={labelClassName}>
                Image URL
                <input
                  required
                  type="url"
                  maxLength={500}
                  value={form.image_url}
                  disabled={isSaving}
                  onChange={(event) => updateField("image_url", event.target.value)}
                  className={inputClassName}
                />
              </label>

              {formError && (
                <p role="alert" className="rounded-lg bg-[#fff2f0] px-3 py-2 text-sm text-[#c13515]">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-full bg-[#ff385c] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#e31c5f] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving
                    ? "Saving…"
                    : editingId === null
                      ? "Create listing"
                      : "Save changes"}
                </button>
                {editingId !== null && (
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={cancelEditing}
                    className="rounded-full border border-[#dddddd] px-5 py-3 text-sm font-semibold hover:bg-[#f7f7f7] disabled:opacity-60"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          <section aria-label="Managed listings">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Your listings</h2>
              {!isLoading && !loadError && (
                <span className="text-sm text-[#717171]">
                  {listings.length} {listings.length === 1 ? "property" : "properties"}
                </span>
              )}
            </div>

            {loadError && (
              <div role="alert" className="mt-5 rounded-xl bg-[#fff2f0] p-4">
                <p className="text-sm text-[#c13515]">{loadError}</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsLoading(true);
                    setLoadError(null);
                    setRetryCount((count) => count + 1);
                  }}
                  className="mt-3 rounded-full border border-[#c13515] px-4 py-2 text-sm font-semibold text-[#c13515] hover:bg-white"
                >
                  Try again
                </button>
              </div>
            )}

            {isLoading ? (
              <p role="status" className="py-16 text-center text-sm text-[#717171]">
                Loading listings…
              </p>
            ) : !loadError && listings.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-dashed border-[#dddddd] px-5 py-12 text-center text-sm text-[#717171]">
                No listings yet. Use the form to create your first property.
              </p>
            ) : !loadError ? (
              <div className="mt-5 space-y-4">
                {listings.map((listing) => (
                  <article
                    key={listing.id}
                    className="flex flex-col gap-4 rounded-2xl border border-[#dddddd] p-4 shadow-[0_3px_12px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center"
                  >
                    <div
                      role="img"
                      aria-label={listing.title}
                      className="aspect-[16/9] w-full shrink-0 rounded-xl bg-[#f2f2f2] bg-cover bg-center sm:aspect-square sm:w-28"
                      style={{ backgroundImage: `url("${listing.image_url}")` }}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold">{listing.title}</h3>
                      <p className="mt-1 truncate text-sm text-[#717171]">{listing.location}</p>
                      <p className="mt-2 text-sm">
                        <span className="font-semibold">${listing.price_per_night}</span>
                        <span className="text-[#717171]"> / night · {listing.category}</span>
                      </p>
                      <Link
                        href={`/listings/${listing.id}`}
                        className="mt-2 inline-flex text-sm font-medium underline underline-offset-2"
                      >
                        View property
                      </Link>
                    </div>
                    <div className="flex shrink-0 gap-2 sm:flex-col">
                      <button
                        type="button"
                        onClick={() => startEditing(listing)}
                        className="rounded-full border border-[#dddddd] px-4 py-2 text-sm font-semibold hover:bg-[#f7f7f7]"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === listing.id}
                        onClick={() => void deleteListing(listing)}
                        className="rounded-full border border-[#dddddd] px-4 py-2 text-sm font-semibold text-[#c13515] hover:bg-[#fff2f0] disabled:opacity-60"
                      >
                        {deletingId === listing.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
