# Checked route catalogs

No real-city catalog is supplied or claimed verified. Keep private catalog files under `catalogs/private` (ignored by Git) and point `CHECKED_CATALOG_PATH` at the file. The schema is in `packages/data-adapters/src/catalog.ts`.

The file has `schemaVersion: 1` and a `cities` array. Each city includes a stable ID, display name, country, IANA timezone, currency, catalog revision, status (`staging` or `route_review`) and 2–20 location records. A location requires its own ID, name, independently collected or licensed entrance latitude/longitude, and evidence with an HTTPS source, checking date, expiry, method and recorded reuse rights. An optional Google place ID supports transient enrichment; it does not grant rights to persist Google names, coordinates, photos or routes.

Only `route_review` catalogs with at least two current location records appear in the route inspector. Future-dated checks and expired records are unavailable. Test-city IDs cannot be promoted by assigning a checked status. A source declaration validates structure, not the truth of an operator's research; independent checking and provider reuse rights must still be reviewed by a person.

This is a location catalog for route integration testing, not a complete itinerary catalog. A route result does not verify opening hours, last admission, date-specific schedules, fee eligibility, parking/tolls, walking connectors, accessibility or strict food suitability. Live itinerary publication remains disabled until those facts and departure-aware scheduling are connected and validated. No generated example is supplied with made-up real-world evidence.

Catalog import occurs at API startup and fails on malformed data rather than silently changing it. There is no public catalog-writing endpoint. M4 adds offline stage/review tooling and private branch-specific dietary evidence records; see `operations.md`. Approved state loads on restart and does not enable live itinerary planning. No actual source collection or dietary verification was performed.
