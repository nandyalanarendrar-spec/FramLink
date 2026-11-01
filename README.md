# FarmLink

A smart agricultural marketplace for Andhra Pradesh. Farmers list crops, buyers browse and negotiate, transporters move the goods, and admins verify everyone. MERN stack (MongoDB, Express, React, Node), in English, Telugu (తెలుగు) and Hindi (हिन्दी).

## What it does

| Role | Can do |
|---|---|
| **Farmer** | List crops with photos, set price/quantity/deadline, answer buyer offers (accept, counter, decline), see suggested buyers, compare mandi prices after transport cost, set price alerts, see demand and supply, track orders and sales history, find and book vehicles |
| **Buyer** | Search and filter the marketplace, send offers, negotiate, choose who arranges transport, track purchases, find and book vehicles, see demand and supply |
| **Transporter** | Register a vehicle (rate per km, areas served), see open routes with prices (sort by pay), send offers on newly sold trades, accept jobs, mark pickup and delivery, keep trip history and earnings |
| **Admin** | Verify accounts (ID documents), switch accounts off, take down listings, resolve reports, manage mandi prices |

Highlights:

- **Account by email.** Log in with your email or mobile number. *Forgot password* sends a 6-digit code to your email (15 minutes, 5 tries, one code a minute) and the answer is the same whether or not the email exists. *Change email* in the profile needs your password and a code sent to the new address, and the old address gets a security notice. Changing or resetting a password signs out every other device.
- **Verification first.** Email OTP, then ID details plus an uploaded ID photo/PDF, then admin approval. Only then can a user trade.
- **Negotiation.** Offer, counter-offer, accept. Stock is reserved atomically, so two buyers can never oversell the last kilos. Phone numbers appear only after acceptance.
- **Transport.** At the deal, choose who arranges transport. If the farmer delivers, ₹ per km × km is added to the buyer's total. When a trade closes, fitting transporters are notified and can offer; or a farmer/buyer can browse the vehicle list and book one directly. Every booking prices as ₹/km × distance.
- **Ratings.** After delivery, the farmer, buyer and transporter on an order can each rate the others once (1 to 5 stars and a comment). Scores show on vehicle cards, transporter offers, and next to the other party on requests and orders, and everyone sees their own score and comments on their profile.
- **Profile editing.** Everyone can change name, mobile and password. Farmers and buyers can edit farm/business details any time; transporters edit vehicle type, capacity, ₹/km, areas and availability. ID details lock after verification; "Edit ID details" sends the account back to pending until an admin verifies it again.
- **Wanted board.** A buyer posts what they need (crop, kg, highest price, needed-by, place). Every farmer sees it; farmers with that crop listed are notified and can offer from their listing, including who handles transport (₹/km × km added to the total). The buyer confirms one offer, which reserves the stock and creates a normal order. Several farmers can fill one request.
- **Farmer reminders (daily, 08:00 IST).** Listing deadline in 2 days, 1 day, today (only if stock is unsold), harvest day for drafts, and when the price of a crop they sell moves 10% or more over the week. Each reminder is sent once.
- **Best time to sell.** From the last 60 days of mandi prices: is today above or below the 30-day average, and which weekday has usually paid more (only when the pattern is consistent). A guide from past prices, not a forecast.
- **Relist** an old listing in one step (same details and copied photos, new date and deadline), and **speak to fill** the crop form or a wanted request in Telugu, Hindi or English (browser speech recognition, Chrome/Edge).
- **Real-time notifications** over Socket.IO (stored in the database for 90 days).
- **Price comparison.** Net revenue = quantity × market price − estimated transport. Mandi prices import daily from data.gov.in (optional).
- **Three languages** (English, Telugu, Hindi) everywhere except the admin pages. Error messages from the server are translated too (fixed sentences; messages containing numbers or names stay English), but notification texts are still English. The choice is remembered per device.

  *Adding a language:* copy `client/src/i18n/hi.ts` to `<code>.ts` and translate the values, register it in `LANGS` in `client/src/i18n/index.ts`, then run `npm run i18n:check` to see anything missing. `scripts/add-lang.cjs <code> entries.json` appends translations in bulk.

## Tech stack

- **Server:** Node 24, Express 5, Mongoose (MongoDB Atlas, transactions), JWT in an httpOnly cookie, bcryptjs, zod, helmet, express-rate-limit, multer (magic-byte checked uploads), node-cron, Socket.IO, nodemailer
- **Client:** Vite, React 19, TypeScript, Tailwind CSS 4, React Router, axios, react-i18next, lucide-react

## Run locally

Needs Node 24+ and a MongoDB Atlas cluster (free tier is fine; it must be a replica set, which Atlas is).

```bash
cd server
cp .env.example .env     # then fill in MONGO_URI, JWT_SECRET, ADMIN_*
npm install
npm run seed:admin       # creates the admin account from ADMIN_* in .env
npm run dev              # API on http://localhost:5000
```

```bash
cd client
npm install
npm run dev              # app on http://localhost:5173 (proxies /api, /uploads, /socket.io to :5000)
```

Without SMTP settings, the email OTP is shown on the verify page. That is for development only and is never returned when `NODE_ENV=production`.

## Environment variables (`server/.env`)

| Variable | Purpose |
|---|---|
| `MONGO_URI` | Atlas connection string (URL-encode special characters in the password) |
| `JWT_SECRET` | 32+ random characters. The server refuses to start in production without it |
| `CLIENT_URL` | Allowed browser origin for CORS |
| `ADMIN_*` | Used by `npm run seed:admin` |
| `SMTP_*`, `MAIL_FROM` | Real email OTP. Blank = dev mode |
| `DATA_GOV_API_KEY` | Daily mandi price import. Blank = admin-entered prices only |
| `UPLOAD_DIR` | Where photos and ID documents are stored (default `server/uploads`) |
| `AUTH_RATE_LIMIT`, `API_RATE_LIMIT` | Per-IP limits (defaults 30 per 15 min for login, 600 per minute for the API) |
| `DNS_SERVERS` | Only if your network cannot resolve Atlas `mongodb+srv` addresses |

## Email (sign-up codes, forgot password, change email)

FarmLink sends 6-digit codes by email. Until you set up a mail service, codes are only printed in the server log (and shown on screen in development), so nobody can receive them in production. [Brevo](https://www.brevo.com) (formerly Sendinblue) has a free plan of about 300 emails a day and works well:

1. Create a free Brevo account.
2. **Verify a sender:** *Senders, Domains & Dedicated IPs* → *Senders* → add the address you want the emails to come from and confirm it through the email Brevo sends. (A free Gmail address works for testing but is often flagged as spam; for real use, send from your own domain and authenticate it in Brevo.)
3. **Get a key:** *SMTP & API*.
   - **API (recommended):** create an API key (starts with `xkeysib-`) and set `BREVO_API_KEY` in `server/.env`.
   - **or SMTP:** use server `smtp-relay.brevo.com`, port `587`, the login shown on that page, and an SMTP key as the password (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`).
4. Set `MAIL_FROM=FarmLink <your-verified-sender@example.com>` (must be the verified sender).
5. Restart the server, log in as admin and open the dashboard: the **Email delivery** card shows what is active and has a **Send me a test email** button.

Keys live only in `server/.env`. Never commit that file or paste keys into chat. If the mail service fails, sign-up still works and the screen tells the user to try *Resend code*; forgot-password answers the same either way so a failure reveals nothing.

## Tests

```bash
cd server
npm test
```

81 integration tests run the real app against a separate `farmlink_test` database on the same cluster, and drop it afterwards, so real data is never touched. They cover: password rules, NoSQL-injection stripping, OTP, role gates, private ID documents, photo validation, marketplace filters, negotiation, race-safe stock, orders, transport (per-km pricing, who arranges, offers, direct vehicle booking), notifications, reports, price alerts, price comparison, demand and supply, suggested buyers, account switch-off, listing takedown, ratings between all three roles, profile editing (password, phone, everyday details, re-verification), reminders, relisting, best-time-to-sell the wanted board (including two offers racing for the last kilos), forgot password, email change, signing out other devices, and sending through the Brevo API (against a stand-in server).

Client checks:

```bash
cd client
npx tsc -b               # type check
npm run i18n:check       # every English UI string has a translation in every language (Telugu, Hindi)
npm run build
npm run voice:check      # the Telugu/Hindi/English voice parser on sample sentences
```

## Deploy

One Docker image builds the React app and serves it from the Express server, so the login cookie needs no CORS.

```bash
docker build -t farmlink .
docker run -p 5000:5000 -v farmlink-uploads:/data/uploads --env-file server/.env -e NODE_ENV=production farmlink
```

`render.yaml` is a ready blueprint for Render. Notes:

- **Uploads need a persistent disk.** Photos and ID documents are stored on disk. On hosts with ephemeral storage (Render free plan, Heroku) they disappear on every deploy. Use a mounted volume, or move storage to S3/Cloudinary (not implemented).
- Set `NODE_ENV=production`, a strong `JWT_SECRET`, and `CLIENT_URL` to the site's own https URL.
- In Atlas, allow the host's IP in Network Access.
- Configure SMTP before launch, otherwise nobody can receive the email OTP in production.

## Security notes

httpOnly cookie auth, bcrypt password hashing (8+ characters with a letter and a number), rate-limited login and API, Helmet with a strict CSP in production, request sanitising against `$`/`.` operator keys, zod validation on every body, uploads checked by file signature not by name, ID documents served only to their owner and admins, role + verification gates on every route, atomic and transactional order writes.

## Known limits

- Server messages and notification texts are English only; admin pages are English only.
- Payments are settled offline. The farmer records "payment received".
- No real-time tracking of vehicles. Distance and ₹/km are entered by the people involved (a rough estimate helper exists only for mandi comparison, using district centres).
- Recommendations and analytics are rule-based on FarmLink's own data, not machine learning.
- Browser-checked: the vehicle list and booking dialog, the farmer-delivery order total, and the profile page edit sections. Other new screens (transporter offers tab, delivery option form, rating box, price alerts, reports, document upload for already-verified accounts) are covered by API tests and a client type check/build only.
