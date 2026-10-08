import assert from "node:assert/strict";
import test from "node:test";

import {
  appendUniqueListings,
  PaginationRequestGuard,
} from "../src/app/pagination-requests.mjs";

test("invalidating a search makes its pending page response stale", () => {
  const requests = new PaginationRequestGuard();
  const previousSearch = requests.begin();

  assert.ok(previousSearch);
  requests.invalidate();
  const currentSearch = requests.begin();

  assert.ok(currentSearch);
  assert.equal(requests.isCurrent(previousSearch), false);
  assert.equal(requests.finish(previousSearch), false);
  assert.equal(requests.isCurrent(currentSearch), true);
  assert.equal(requests.finish(currentSearch), true);
});

test("only one page request can be active per search generation", () => {
  const requests = new PaginationRequestGuard();
  const firstPage = requests.begin();

  assert.ok(firstPage);
  assert.equal(requests.begin(), null);
  assert.equal(requests.finish(firstPage), true);
  assert.ok(requests.begin());
});

test("appending a page skips ids already present or repeated in that page", () => {
  const current = [{ id: 1 }, { id: 2 }];
  const appended = appendUniqueListings(current, [
    { id: 2 },
    { id: 3 },
    { id: 3 },
  ]);

  assert.deepEqual(appended, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});
