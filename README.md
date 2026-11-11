# The Humor Study

A participant-facing humor research study built with Next.js App Router, Supabase Auth/Postgres, and Tailwind CSS. Participants complete their profile and onboarding steps, browse active studies, rate captions, and revisit saved completion results.

## Setup

1) Use Node.js 24.x and npm 11.x. Create `.env.local` with the required public application values:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
# or NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GOOGLE_CLIENT_ID=...
# Optional but recommended for OAuth redirects:
NEXT_PUBLIC_SITE_URL=http://localhost:3002
```
Ensure Google OAuth is enabled in Supabase and the redirect URL `http://localhost:3002/auth/callback` is added.

2) Install and run the app:
```
npm ci
npm run dev
```

The development server runs at `http://localhost:3002`. Sign-in uses Google OAuth; protected routes use Supabase SSR sessions and the Next.js proxy.

## Import the course Supabase teaching data

The extracted `supabase-teaching-data/` folder contains the shared anonymized database dump. Import it only into a **new, empty Supabase project you control**—never into production, the course project, or a project with data you need to keep.

1. In Supabase, create a new project and wait for its database to finish provisioning.
2. Install PostgreSQL 17 command-line tools (`psql`). In the project's **Connect** panel, get the direct database connection details or use the **session pooler**; do not use the transaction pooler. Keep the database password available for the prompt.
3. From the repository root, verify the extracted files:

   ```sh
   cd supabase-teaching-data
   shasum -a 256 -c CHECKSUMS.sha256
   ```

4. Run the provided restore script with the new project's host, port, and database user. Replace the placeholders; `psql` prompts for the database password:

   ```sh
   sh ./restore.sh --dbname="host=YOUR_HOST port=5432 user=YOUR_DB_USER dbname=postgres sslmode=require" --password
   ```

   The import loads the schema and data in one transaction and can take several minutes. It uses `psql` because the data file contains PostgreSQL `COPY` commands; do not paste it into the Supabase SQL Editor. The script runs `06-verify.sql` and stops on errors.
5. After a successful import, configure `.env.local` with this **same new project's** Supabase URL and public anon/publishable key. Enable Google sign-in and add `http://localhost:3002/auth/callback` to the allowed redirects. Create and sign in with your own test account; imported placeholder users are disabled and cannot sign in.
6. To enable the resumable-study feature in this repository, apply `supabase/migrations/20261105153000_add_resumable_study_progress.sql` to the imported project after the data restore.

See `supabase-teaching-data/RESTORE.md` and `supabase-teaching-data/REPOSITORIES.md` for the full import notes, privacy details, and funnystudy account setup. The dump and ZIP are excluded from Git.

## Participant progress and study resume

The home page presents Profile, Notifications, and Demographics setup status before active studies. Study cards show whether a study is new, in progress, or completed; unfinished studies can resume from their most recently saved caption and run progress.

Before deploying the resumable-study feature, apply the new migration under `supabase/migrations/` to the target Supabase database. The progress save uses the signed-in participant's JWT and database RLS; no service-role key is used. See [the Iteration 1 progress update](./docs/semester-project-iteration-1.md) for the persona, problem, implementation, review status, and next steps.

Focused regression checks:

```
npm run test:demographics
npm run test:images
npm run test:settings
```

### OAuth redirect behavior
- The `/auth/login` handler sends Supabase a clean callback URL (`/auth/callback`) with no query params so it matches the allowlist exactly. The `next` path is stored in a temporary cookie and read in `/auth/callback` before redirecting to the final page. The callback route uses `NEXT_PUBLIC_SITE_URL` for the post-login redirect origin in deployed environments because Amplify SSR can report an internal localhost origin while handling `/auth/callback`.
- Ensure the Supabase Redirect URLs include the exact callback paths you use (e.g., `http://localhost:3000/auth/callback`, `https://localhost:3000/auth/callback`, plus production callbacks). If you add query params to the allowlist in Supabase, keep them consistent.

## Deploy on AWS

This app is ready for AWS Amplify Hosting through a console-managed GitHub App
connection. Amplify uses the committed root `amplify.yml` build spec.

One-time setup:

1. Install the Amplify GitHub App for `us-east-1` and grant it access to
   `The-Humor-Project/funnystudy`:
   `https://github.com/apps/aws-amplify-us-east-1/installations/new`
2. In the AWS Amplify console, choose **New app** -> **Host web app**.
3. Choose **GitHub** and select `The-Humor-Project/funnystudy`.
4. Create the staging app from the `staging` branch and the production app from
   the `main` branch.
5. Confirm Amplify uses the committed root `amplify.yml` build spec.
6. Add the custom domains for each branch in the Amplify console.

Required Amplify environment variables:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

Amplify must rebuild after environment values change. The root `amplify.yml`
writes all `NEXT_PUBLIC_*` Amplify environment variables into `.env.production`
before `next build` so they are available to the Next.js SSR runtime. The build
fails early if the required site/auth variables are missing from the selected
Amplify app or branch. Keep `NEXT_PUBLIC_SITE_URL` set per branch; the OAuth
callback uses it for post-login redirects instead of trusting Amplify SSR
request origins.

Add the deployed `/auth/callback` URLs in Google OAuth and Supabase auth
settings. This app does not use a Supabase service-role key; all Supabase
requests should use the logged-in user's JWT.



## Funny Study Images

Funny Study Images in Staging:

Dog at Bar:
faf811a5-ee67-47e8-80bc-a1e45255f613

https://images.almostcrackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/faf811a5-ee67-47e8-80bc-a1e45255f613.jpeg


Funny Study Images in Production:

Deer:
25a87637-d43b-491a-8387-151dce7c3fc3

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/25a87637-d43b-491a-8387-151dce7c3fc3.jpeg


Bible 2:
57215cb3-912c-4ecb-80e4-4688b3355e1d

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/57215cb3-912c-4ecb-80e4-4688b3355e1d.png


Goat:
7181be02-566a-42d6-8bbd-05a646900f12

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/7181be02-566a-42d6-8bbd-05a646900f12.jpeg


Polite Cat:
8c33557b-47ee-450d-9dbd-1a67f7392b42

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/8c33557b-47ee-450d-9dbd-1a67f7392b42.jpeg


Ben:
b02d1d13-5d2b-431b-a769-fa0c952ff4ad

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/b02d1d13-5d2b-431b-a769-fa0c952ff4ad.png


Llama:
32d8919d-0d2e-4d98-a04c-950a129ba229

https://images.crackd.ai/3caa0904-5aa6-4e7a-ad80-6d9bc0a6be0b/32d8919d-0d2e-4d98-a04c-950a129ba229.jpeg


Snow Penis:

c61f076b-754c-410c-b6c8-f526b4253ddb

https://images.crackd.ai/09842ed2-d35d-4dbc-b9e0-fc2cefa8fd93/c61f076b-754c-410c-b6c8-f526b4253ddb.jpeg


Jae:

6e248baf-1e36-4a30-9277-42a949fe325d

https://images.crackd.ai/2877cb7c-4ef9-4fcc-921c-8ca87d6ed47f/6e248baf-1e36-4a30-9277-42a949fe325d.jpeg
