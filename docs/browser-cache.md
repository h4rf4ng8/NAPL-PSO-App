# Browser read cache

The GraphQL transport caches completed successful responses for 30 seconds in the current Apollo client. Query text and variables identify each entry. Passing `{ force: true }` to the transport bypasses freshness. Ordinary repeat loads, including dashboard reloads, may reuse a complete cached response until expiry. Failed reads never populate the cache.

The cache holds at most 32 query entries. A completed new query clears the existing entries and Apollo data when that bound is reached, including when many distinct queries finish concurrently.

A successful REST command under `/api/` resets the client, cancels older reads, and clears cached data before subsequent reads. Failed commands do not invalidate the cache. GraphQL POST requests are reads and do not trigger this invalidation.

Logout and session changes retain the same reset path. Each client has its own freshness state, and cancelled responses cannot populate the replacement client's cache. Data is held in memory only.

Run `npm test -w @napl/web` to check freshness, expiration, forced reads, successful and failed mutations, cancellation, concurrent entry bounds, and session isolation.
