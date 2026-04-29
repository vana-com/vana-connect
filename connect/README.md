This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
pnpm dev
```

From the repository root, you can run the same app with:

```bash
pnpm --filter connect dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment

Copy `.env.local.example` to `.env.local` for local overrides.

The grants page supports an optional launch override:

- `NEXT_PUBLIC_GRANTS_TEST_DEEPLINK_URL` - deterministic deep-link used for local launch smoke tests.

## Local end-to-end (account app + Postgres + Hydra)

This brings up the account app on `http://localhost:3000` against a local Postgres and a local Hydra, with a real Privy dev app. No cloud deps required.

1. Start local Postgres for the account app:

   ```bash
   docker compose -f connect/docker-compose.local.yml up -d
   ```

   Postgres binds to `127.0.0.1:54329` and persists in the `vana-connect-local-pgdata` volume.

2. Apply migrations (idempotent; tracks applied files in `_migrations`):

   ```bash
   DATABASE_URL=postgres://vana:vana-local-pw@127.0.0.1:54329/vana_connect?sslmode=disable \
     node connect/scripts/migrate-local.mjs
   ```

3. Start local Hydra in account-app mode (admin `:4445`, public `:4444`) from the POC stack:

   ```bash
   (cd spikes/hydra-v26-poc && ./scripts/up-account.sh)
   (cd spikes/hydra-v26-poc && ./scripts/register-memory-app-client.sh)
   ```

4. Configure env: `cp connect/.env.local.example connect/.env.local`, then fill in the four Privy values from your dev app at https://dashboard.privy.io. Leave `DATABASE_URL`, `HYDRA_PUBLIC_URL`, and `HYDRA_ADMIN_URL` as the local defaults.

5. Run the account app:

   ```bash
   pnpm --filter connect dev
   ```

   Open http://localhost:3000.

To reset the local DB, stop the stack and remove the volume:

```bash
docker compose -f connect/docker-compose.local.yml down -v
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
