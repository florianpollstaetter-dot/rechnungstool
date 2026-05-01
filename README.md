This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## End-to-end tests (SCH-976)

The K2-γ permissions + G10 schedule logic is covered by a Playwright suite
under `tests/e2e/`. Each run provisions a fresh `qa-perms-<runid>` Supabase
tenant + 4 test users via the service-role key, then tears them down.

```bash
# Local — boots `npm run dev` automatically and reads .env.local for the
# Supabase URL / anon key / service-role key.
npm run test:e2e

# Against a deployed environment (Vercel preview, live test tenant):
BASE_URL=https://my-preview.vercel.app npm run test:e2e

# Pick a single spec while iterating:
npm run test:e2e -- tests/e2e/specs/04-schedule-pause.spec.ts
```

Required environment variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
CI runs the same suite on every push to master (`.github/workflows/qa-playwright.yml`).

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
