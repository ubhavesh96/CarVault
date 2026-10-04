# CarVault AI

**A trusted, evidence-backed record of a car's whole life, built for the UAE.**

CarVault turns a vehicle's scattered paperwork (registration, service invoices, inspections, insurance, mileage) into one verifiable record. It scores how well that history is evidenced, flags what is missing, and lets the owner share exactly what they choose with a buyer, garage, insurer or lender.

> Product concept and working prototype. Sample data is fictional, and the AI runs in demo mode until an API key is added.

![Vehicle overview for an owner](docs/screenshots/owner-overview.png)

---

## The problem

Buying a used car in the UAE is still an act of trust. The history lives in glove boxes, WhatsApp threads and workshop systems. Mileage can be rolled back, and service gaps are invisible. Even honest sellers struggle to prove their car was looked after.

- **Owners** can't easily show the care they've put into a car, so they don't get credit for it at resale.
- **Buyers** can't tell a well-kept car from a well-presented one.
- **Dealers, insurers and lenders** re-check the same facts on every car, every time.

## The idea

One record per vehicle, where every fact carries its source. CarVault doesn't claim to know a car's condition. It shows **how strong the evidence is**, and what would make it stronger.

## Who it's for

| User | What they get |
|---|---|
| **Owner** | A garage of their cars, maintenance insight, and a passport they can share with control. |
| **Dealership** | Documented stock, resale readiness per car, and buyer-ready share links. |
| **Fleet** | Imported service records and transfer-ready files when cars are sold. |
| **Insurer and lender** | Ownership, insurance and mileage evidence they can rely on. |
| **CarVault Admin** | Organizations, licensing, branding, trust rules and pilot tracking, all in one console. |

## Key experiences

**Vehicle Confidence.** A 0–100 score for how well a car's *history* is evidenced. It covers eight areas: identity, ownership, mileage, service, insurance, inspection, accident and claims, and documents. Every area explains itself and lists its sources. It also shows what's missing and how many points adding it would gain.

![Vehicle Confidence breakdown](docs/screenshots/vehicle-confidence.png)

**Share on the owner's terms.** The owner picks exactly what to share. Every section starts unticked, the link expires, and it can be revoked at any time. Uploaded files and personal details are never included.

![Owner share dialog](docs/screenshots/share-dialog.png)

**Resale Readiness and the UAE transfer checklist.** Shows what is ready for a buyer and what isn't. The checklist covers the RTA transfer requirements: Mulkiya and insurance valid, fines paid, any loan cleared, a technical test for older cars, Emirates ID, and buyer insurance.

![Resale readiness](docs/screenshots/resale-readiness.png)

**Official evidence.** The owner uploads the RTA Vehicle Status Certificate. Its owner history, insurance history and odometer readings flow into the record. The certificate only becomes *Verified* after a person checks it with the issuer.

**CarVault Insight.** An assistant that answers from the car's own records ("What does my car need?", "Is it ready to sell?"). Every statement is labelled as verified, inferred, estimated or unknown.

**Built for businesses too.** One platform serves dealerships, fleets, insurers, lenders, service centres and inspection companies, each under its own brand, with only the modules it licenses.

![Dealer dashboard](docs/screenshots/dealer-dashboard.png)

## Product principles

1. **Evidence over claims.** Every fact shows where it came from: Verified, Imported, User provided, Estimated, Conflict or Unknown.
2. **AI interprets; it never proves.** CarVault Insight is labelled and never counts as evidence.
3. **Unknown is an answer.** "No accident record on file" is never presented as "accident-free".
4. **The owner controls sharing.** Nothing leaves the account unless the owner selects it.
5. **Honest about what's connected.** Integrations that aren't live are labelled as such.

## North Star metric

**Trusted Active Vehicles:** vehicles with Vehicle Confidence of 85 or more, whose evidence was updated in the last 90 days. It rewards complete records that stay current, which is what makes a car easier to sell, insure and finance.

![Pilot programme tracking the North Star](docs/screenshots/admin-pilots.png)

## Design approach

- **Calm, premium and quietly technical,** designed for UAE premium-car owners and the businesses that serve them.
- **Cool graphite palette** with a single electric-blue accent for intelligence and selection. Colour signals status only (good, attention, due), never decoration.
- **Manrope** throughout, with tabular figures for data.
- **Glass selection states** instead of coloured outlines. Light and dark themes are a per-person setting.
- **Accessible by default:** text meets WCAG AA contrast (4.5:1 or more) in both themes, and controls meet 3:1. Tenant brand colours are adjusted automatically to stay legible.
- **Ready for Arabic:** the layout already works right to left; Arabic text is still to come.
- **Mobile-first owner flows,** with a bottom navigation bar and dialogs that fit a phone screen.

## Go-to-market

Business first. Dealers, fleets and inspection partners run time-boxed pilots with an agreed goal and a North Star target. Owners arrive through those partners' sales and service journeys. Marketplaces and car-buying services receive owner-approved share links and an embeddable listing badge. See [docs/partners/partner-integration.md](docs/partners/partner-integration.md).

## What's next

- Real sign-in (UAE PASS for owners, SSO for businesses) to replace the demo identity switcher.
- Arabic language support.
- Data partnerships: RTA / ITC registry data, testing centres, insurers and vehicle-history providers.
- Production hosting in a UAE cloud region, with privacy controls aligned to the UAE Personal Data Protection Law (PDPL).

## Try the prototype

```bash
npm install
npm run dev
```

Then open **http://localhost:5173** and choose a sample persona (owner, dealer, insurer, fleet or CarVault Admin). The app uses React and TypeScript on the front end, with a Node/Express API behind it. All data is fictional.

---

Product management and design by [@ubhavesh96](https://github.com/ubhavesh96).
