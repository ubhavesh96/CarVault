# CarVault AI

**Trusted vehicle lifecycle intelligence.** CarVault is the digital identity and lifecycle record of a vehicle: documents, ownership, service, inspections, insurance and mileage become one evidence-backed record, scored by **Vehicle Confidence** and shared as a **Vehicle Passport**.

It is a category-based, multi-tenant, white-label platform: dealerships, insurers, finance houses, service centres, inspection companies, fleets and individual owners each get the experience they are licensed for.

## Run it

```bash
npm install
npm run dev          # API on :4000, web app on http://localhost:5173
```

Production-style (single server): `npm run build && npm start`, then open http://localhost:4000.

Sample organizations, people and vehicles are seeded on first run (all fictional). **Reset demo data** in the account menu restores them.

### Signing in (prototype)

There is no real authentication yet. The sign-in page lets you act as any sample person: CarVault Admin, an organization admin or team member, or a vehicle owner. **Everything after identity is enforced on the server**: tenant isolation, roles and module entitlements. Replace `currentUser` resolution in [server/src/auth.ts](server/src/auth.ts) with a real identity provider (OIDC/SSO) before real use.

## Architecture

```
CARVAULT CORE ─ Data & evidence ─ Vehicle intelligence ─ Confidence Engine ─ Vehicle Passport
      │
      └─ Category ─ Tenant ─ Licensed modules ─ Users ─ Vehicles
```

| Piece | Where |
|---|---|
| Catalog: categories, modules, per-category navigation, entitlements | [server/src/catalog.ts](server/src/catalog.ts) |
| Access control: identity, tenant isolation, roles, module checks, audit | [server/src/auth.ts](server/src/auth.ts) |
| Confidence Engine and Resale Readiness | [server/src/confidence.ts](server/src/confidence.ts) |
| Routes: session, org, admin, portfolio, data rooms, public links | [server/src/routes.ts](server/src/routes.ts) |
| Sample tenants | [server/src/seedTenants.ts](server/src/seedTenants.ts) |
| Client session, entitlements and white-label tokens | [client/src/session.tsx](client/src/session.tsx) |

### Licensing rules

- **CarVault Admin** owns the catalog and is the only role that can assign, change, add or remove categories, enable or remove modules, suspend tenants, set custom domains and passport co-branding, and change Confidence Engine weights.
- **Organization admins** manage users and branches and, when self-serve branding is on, their own app name, logo, colours, mode and footers.
- **Tenants see locked categories and modules** ("Available with …") but can't activate them. The server refuses with *"Your organization is not licensed for this category. Contact CarVault Admin."* and logs the attempt.
- Tenants only ever see their own vehicles. Another tenant's vehicle returns 404.

### Vehicle Confidence

How confident CarVault is in a vehicle's **history**, not its mechanical condition. Eight dimensions (identity, ownership, mileage, service history, insurance, inspection, accident/claims, documents) are scored from their evidence. Each explains itself, lists its evidence chain and sources, shows what's missing, and estimates the gain from adding it by re-scoring. Evidence counts by trust: verified fully, imported 85%, user-provided 50%, conflict 20%; CarVault Insight never counts as evidence.

### Official evidence (RTA Vehicle Status Certificate)

Owners order the certificate on rta.ae with UAE PASS and upload it (document type *RTA Vehicle Status Certificate*). Each odometer reading on it becomes a dated timeline entry, and it counts as ownership and insurance-history evidence. It stays *User provided* until an organization admin, or CarVault's own team for owner accounts, checks the certificate number with the RTA and records it with **Verify** on the Documents tab (`server/src/official.ts`). There is no live registry connection yet; Admin → Data Sources shows which sources need partnerships.

### UAE transfer checklist

Resale → *UAE transfer checklist* covers the Dubai RTA transfer requirements: Mulkiya and insurance valid, fines paid, loan cleared (or none), technical test for cars over 3 years, Emirates ID, and buyer insurance. Items come from documents or are seller-confirmed and labelled as such. The fines confirmation goes stale after 7 days. It feeds Resale Readiness and can be shared in a data room (`server/src/transfer.ts`).

### Go-to-market: pilots and partners

- Admin → **Pilot Programme** tracks design-partner pilots against their North Star target (see `docs/gtm/pilot-playbook.md`).
- Data rooms have audience presets and an embeddable listing badge (`/api/public/dataroom/:token/badge.svg`) for marketplaces and car-buying services (see `docs/partners/partner-integration.md`).

## Data trust model

Verified · User provided · Imported · CarVault Insight · Estimated · Unverified · Conflict · Unknown. Every important fact in the passport shows its source.

## Turning on real AI

The app runs on a grounded mock by default. Set `ANTHROPIC_API_KEY` in `.env` and restart to use Claude; if a live call fails the mock takes over. The provider seam is `AIProvider` in [server/src/ai/types.ts](server/src/ai/types.ts).

## Design system

Tokens live in [client/src/styles.css](client/src/styles.css); the platform layer (shell, admin, confidence, data rooms, white-label, light theme) in [client/src/platform.css](client/src/platform.css). Cool graphite palette, electric blue for intelligence and selection only, semantic colours for status only. Logical CSS properties throughout; preview right-to-left with `?dir=rtl`. Tenant branding overrides the accent, secondary colour, typeface and mode, never the status colours or the trust model.

## Known limits

- **Prototype identity**, as above.
- **Integrations are not live.** "Imported" records for ABC Motors and Meridian Fleet are seeded sample data. Telematics, registration-authority and insurer-claims connectors are listed as not connected.
- **Value estimates are an illustrative model**, not UAE market data. **Service intervals are typical values**, not manufacturer schedules.
- Storage is JSON files (`server/data/`), with no database. Share and data-room links are bearer links (data rooms expire and can be revoked).
- Reference vehicle photos come from Wikimedia Commons (freely licensed, credited, labelled "Reference photo"). Disable with `REFERENCE_IMAGES=off`.
- Arabic RTL is layout-ready; strings are not yet translated.
