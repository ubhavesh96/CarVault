# Partner integration: data rooms and listing badges

For marketplaces, car-buying services, dealers' websites and lenders that want to show or use a vehicle's CarVault record. No API key is needed: the owner creates a data room and gives you its link. That link is the consent. It expires, and the owner can revoke it at any time.

## What the owner does

In **Vehicle → Data Room**, the owner (or the dealer acting for them) picks who the room is for:

| Preset | Sections shared | Expires |
|---|---|---|
| Private buyer | Passport, Confidence, Service, Mileage, Inspection, Transfer readiness | 48 h |
| Car-buying service | The above, plus Ownership and Insurance | 72 h |
| Online listing | Passport, Confidence, Service, Mileage, Inspection | 7 days |
| Insurer | Passport, Confidence, Inspection, Ownership, Insurance | 72 h |
| Lender | Passport, Confidence, Ownership, Mileage, Insurance, Transfer readiness | 72 h |

They then share the link, which looks like `https://<carvault-host>/d/<token>`.

## 1. Listing badge (no integration)

```html
<a href="https://<carvault-host>/d/<token>" target="_blank" rel="noopener">
  <img src="https://<carvault-host>/api/public/dataroom/<token>/badge.svg"
       width="320" height="64" alt="CarVault verified vehicle history">
</a>
```

- It shows the Vehicle Confidence score only if the owner shared the Confidence section. Otherwise it shows the vehicle and its number of source-backed records.
- When the room expires or is revoked, it switches to a neutral "Link expired or revoked" badge. Caches refresh every 5 minutes.

## 2. JSON (for your systems)

`GET https://<carvault-host>/api/public/dataroom/<token>`

- Returns only the sections the owner chose.
- Returns `410` once the room has expired or been revoked, and `404` for an unknown token.
- Each call counts as a view, and the owner sees the view count.

Top-level fields:

| Field | Present when | Contents |
|---|---|---|
| `room` | always | recipient, expiry, sharing organization, sections |
| `vehicle` | always | title, year, model, location, photo (reference photos are flagged) |
| `identity` | Passport shared | each fact with its `trust` and `source` |
| `confidence` | Confidence shared | score, level and per-dimension breakdown with reasons |
| `serviceHistory` / `inspection` | Service / Inspection shared | dated records, odometer, workshop, `trust` |
| `mileage` | Mileage shared | dated odometer readings and the mileage assessment |
| `ownership`, `insurance` | shared | evidence lists with `trust` |
| `documents` | Documents shared | which documents are on file (never the files themselves), and `verifiedWithIssuer` when a person checked a document with its issuer |
| `transfer` | Transfer readiness shared | UAE transfer checklist: status per item, and whether it came from documents or was seller-confirmed |
| `unknowns`, `notice` | always | what CarVault can't show, and how to read the record |

## Reading trust labels

Every fact carries a `trust` value:

- **`verified`:** read from a source document, or checked with the issuer.
- **`imported`:** from a connected business system.
- **`user`:** entered or uploaded by a person, not yet backed by a source.
- **`conflict`:** contradicts other evidence.
- **`unknown`:** nothing on file.

Treat `user` and seller-confirmed items as claims, not facts. CarVault documents history; it does not physically inspect vehicles.

## Not available yet

- Webhooks, bulk pulls and partner API keys. These come after pilots show which partners need them.
- Direct registry data (RTA / ITC). Until data-sharing agreements are in place, official data arrives as the owner's RTA Vehicle Status Certificate, checked by a person.
