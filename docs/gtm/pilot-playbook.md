# CarVault pilot playbook (UAE, business-first)

CarVault launches through businesses, not consumer marketing. Dealers, fleets and inspection companies already hold the records, sell the cars, and meet the buyers. Each pilot proves one thing: documented cars are easier to sell, finance and insure. Owners come along through those partners.

Figures marked *assumption* are hypotheses to test in pilots. They are not market data.

## 1. Who we pilot with, in order

| Segment | Why they buy | What they get in CarVault | First proof point |
|---|---|---|---|
| **Used-car dealers** (independent premium and franchise used-car arms) | Buyers distrust mileage and history; stock that is documented should turn faster | Dealership category: Vehicle Confidence, Data Room, listing badge, UAE transfer checklist | Share of stock at Vehicle Confidence 85+, and data-room views per listing |
| **Fleets and leasing companies** | De-fleeted cars sell at auction below retail because history travels poorly | Fleet category: imported service records, transfer-ready remarketing files | Transfer-ready share of cars going to remarketing |
| **Inspection companies** | Their report is a one-off PDF; a verifiable, shareable result is worth more | Inspection category: inspections flow straight into the passport | Inspections attached to shared passports |
| **Car-buying services and marketplaces** (for example instant-offer buyers and listing sites) | They price risk on every car they buy or list | **Partners, not tenants**: they receive data-room links and embed the badge (see `docs/partners/partner-integration.md`) | Share of their inbound cars arriving with a CarVault data room |

Insurers and lenders follow once there are enough documented vehicles for the evidence to matter to underwriting.

## 2. The pilot offer

- **Length:** 60 days, one extension at most.
- **Price:** free during the pilot. We agree the post-pilot price before starting (*assumption to test:* a per-vehicle monthly fee for dealers and fleets).
- **What the partner commits to:** a named owner on their side, their live stock or fleet list, and asking sellers or drivers for the RTA Vehicle Status Certificate.
- **What we commit to:** onboarding within one week, a weekly 20-minute review, and checking certificates with the RTA for them during the pilot (the "Verify with issuer" step).

## 3. Success criteria (agreed before day 1)

Record them in **CarVault Admin → Pilot Programme** so the numbers are tracked automatically:

1. **North Star target:** share of the partner's vehicles at Vehicle Confidence 85+. *Assumption:* 60% for dealers, 50% for fleets.
2. **Buyer use:** data rooms created per car sold, and buyer views per data room.
3. **Transfer readiness:** share of cars leaving with the UAE transfer checklist complete.
4. **The partner's own words:** one sentence in the *Success looks like* field, for example "documented stock sells faster".

At the end date we either convert, extend once, or end. Pilots don't drift.

## 4. Onboarding checklist (week 1)

1. Create the organization with the right category (Admin → Organizations), and set branding if they want their own.
2. Add them to the Pilot Programme with stage *In pilot*, dates, target and goal.
3. Import or add their vehicles. For dealers, start with current stock only.
4. Ask for an RTA Vehicle Status Certificate for each car (about AED 120, ordered on rta.ae or the RTA app with UAE PASS). It lifts mileage, ownership and insurance evidence in a single upload.
5. Show their team the three buyer-facing actions: **Data Room** (use the *Online listing* preset for the badge), **Passport**, and the **Resale → UAE transfer checklist**.

## 5. Weekly review (20 minutes)

- North Star against target, from the Pilot Programme page.
- Cars below 85: open **Vehicle Confidence** and work the top improvement.
- Data rooms and buyer views: are listings using the badge?
- Blockers: missing certificates, conflicts to resolve, users who need access.

## 6. Proof we need before scaling beyond pilots

- At least 3 converted partners across 2 segments.
- Evidence that documented cars sell faster or closer to asking price (the partner's own sales data, shared with permission).
- At least one data partnership in progress: RTA / ITC data sharing, a testing-centre feed, or a history-provider reseller agreement. This is what replaces manual certificate checks and becomes the moat.

## 7. What not to do yet

- Consumer advertising. Owners arrive through partners' sales and service journeys.
- Integrations before a pilot proves demand. Links and badges work with no integration on the partner's side.
- Claims we can't back up. CarVault documents history; it does not inspect cars, and every score says so.
