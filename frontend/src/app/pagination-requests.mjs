/**
 * @typedef {{ generation: number, sequence: number }} PaginationRequest
 */

export class PaginationRequestGuard {
  generation = 0;
  sequence = 0;
  activeSequence = null;

  invalidate() {
    this.generation += 1;
    this.sequence += 1;
    this.activeSequence = null;
  }

  /** @returns {PaginationRequest | null} */
  begin() {
    if (this.activeSequence !== null) {
      return null;
    }

    this.sequence += 1;
    this.activeSequence = this.sequence;
    return { generation: this.generation, sequence: this.sequence };
  }

  /** @param {PaginationRequest} request */
  isCurrent(request) {
    return (
      request.generation === this.generation &&
      request.sequence === this.activeSequence
    );
  }

  /** @param {PaginationRequest} request */
  finish(request) {
    if (!this.isCurrent(request)) {
      return false;
    }

    this.activeSequence = null;
    return true;
  }
}

/**
 * @template {{ id: number }} T
 * @param {T[]} currentListings
 * @param {T[]} incomingListings
 * @returns {T[]}
 */
export function appendUniqueListings(currentListings, incomingListings) {
  const existingIds = new Set(currentListings.map((listing) => listing.id));
  const newListings = incomingListings.filter((listing) => {
    if (existingIds.has(listing.id)) {
      return false;
    }
    existingIds.add(listing.id);
    return true;
  });
  return [...currentListings, ...newListings];
}
