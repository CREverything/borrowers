# borrowers
A borrowing marketplace.

Use Node.js 22.18 or newer. Install both projects' dependencies:

```sh
npm ci
npm --prefix backend ci
```

Create your local configuration using `env.example` as a reference. The root
`.env` can hold all required settings: `DATABASE_URL`, `CLERK_SECRET_KEY`, and
`VITE_CLERK_PUBLISHABLE_KEY`. Use publishable and secret keys from the same Clerk
application and environment. `NEXT_PUBLIC_` names are for Next.js; this project
uses Vite. Restart development servers after changing configuration.

Start the frontend and API together:

```sh
npm run dev
```

Open http://localhost:5173. The frontend forwards database and account requests
to the API on port 3001. `npm run dev:web` and `npm run api` can also start the
servers separately. Vite refuses to switch ports when 5173 is busy, because
Clerk's default allowed origins use ports 5173 and 4173.

Check http://localhost:5173/api/health for database connectivity. For more detail:

```sh
npm --prefix backend run db:check
```

If the check reports missing tables or columns, apply the schema updates:

```sh
npm --prefix backend run db:migrate
```

On a new database, `npm --prefix backend run db:seed` adds demo listings.
`backend/.env` is optional; its settings override the root `.env` for the API
only. Keep Clerk settings consistent between the frontend and backend. For a
custom frontend origin, set `CLERK_AUTHORIZED_PARTIES` to a comma-separated list
of allowed origins on the backend.
