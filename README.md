# PF ESIC Desk

Client, collection and receipt manager for a PF/ESIC consultancy. Next.js 16 · Supabase · Tailwind 4 · PWA.

## Run it locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in your Supabase project URL and keys.
3. Apply the database migrations: `npx supabase db push` (hosted) or `npx supabase start` (local, needs Docker).
4. Add your login: `npm run user:add -- you@example.com A`
5. `npm run dev` and open http://localhost:3000

The style guide is at `/design` and works without a database.

See `CLAUDE.md` for conventions, commands and the folder map.
