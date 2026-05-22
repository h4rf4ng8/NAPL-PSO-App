# NAPL Stats Hub — Deployment Guide

This is a React web app for the North America Premier League (Pro Soccer Online community). It tracks player stats, awards, teams, news, and matchups.

This guide walks through deploying it to a live URL: **app.naplpso.com**

**Estimated time for someone with web dev experience:** 4-6 hours
**For a coder learning React/Supabase as they go:** 10-15 hours

---

## Stack

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Supabase (Postgres database + Auth + Storage)
- **Hosting:** Vercel
- **Domain:** Cloudflare/your existing WordPress DNS

All three services have free tiers that are more than enough for a 200-user league.

---

## Step 1 — Local development setup

### 1.1 Install Node.js
Download the LTS version from [nodejs.org](https://nodejs.org). Install it. Verify in a terminal:
```bash
node --version    # should print v20.x.x or higher
npm --version     # should print 10.x.x or higher
```

### 1.2 Install project dependencies
Open a terminal in this folder (the one with `package.json`) and run:
```bash
npm install
```
This downloads everything the project needs (about 200 MB into a `node_modules` folder).

### 1.3 Try it locally (will fail until step 2 is done)
```bash
npm run dev
```
This starts a local dev server at http://localhost:5173. It WILL show an error about missing Supabase env vars — that's expected until step 2.

---

## Step 2 — Set up Supabase

### 2.1 Create an account
Go to [supabase.com](https://supabase.com), sign up (free), create a new project.

When prompted:
- **Project name:** `napl-stats`
- **Database password:** generate a strong one and save it somewhere (you'll rarely need it)
- **Region:** pick whichever is closest to your users (e.g. `us-east-1` for North America)
- **Plan:** Free

Wait ~2 minutes while Supabase provisions everything.

### 2.2 Run the database schema
Once the project is ready:
1. Left sidebar → **SQL Editor**
2. Click **+ New query**
3. Open the `supabase-schema.sql` file from this project, copy ALL of it, paste into the editor
4. Click **Run** (or hit Ctrl/Cmd+Enter)

You should see "Success. No rows returned." — that means it created all the tables.

Verify: left sidebar → **Table Editor**. You should see `accounts`, `teams`, `submissions`, `news`, `settings`.

### 2.3 Create the image storage bucket
1. Left sidebar → **Storage**
2. Click **New bucket**
3. Name: `napl-images`
4. Toggle **Public bucket** ON
5. Click **Save**

### 2.4 Configure Auth settings
1. Left sidebar → **Authentication** → **Providers**
2. Make sure **Email** is enabled (it's on by default)
3. Click on **Email** to expand its settings
4. Find **Confirm email** and turn it **OFF** (users use fake `@napl.local` emails so confirmation links won't work)
5. Save

### 2.5 Get your API keys
1. Left sidebar → **Project Settings** (gear icon) → **API**
2. Copy two values:
   - **Project URL** (looks like `https://abcdefg.supabase.co`)
   - **anon public key** (long string starting with `eyJh...`)

### 2.6 Create your local .env file
In the project folder, copy `.env.example` to a new file called `.env`:
```bash
cp .env.example .env    # Mac/Linux
copy .env.example .env  # Windows
```
Open `.env` in any text editor and paste in your two values:
```
VITE_SUPABASE_URL=https://abcdefg.supabase.co
VITE_SUPABASE_ANON_KEY=eyJh...
```

### 2.7 Try it locally — it should work now
```bash
npm run dev
```
Open http://localhost:5173. You should see the NAPL login screen. Register an account. It should work and persist (refresh the page — you'll still be logged in).

---

## Step 3 — Set Harfang as super admin

The code has a hardcoded super admin (`SUPER_ADMIN_USERNAMES` in `src/App.jsx`, line ~28). Currently it's set to `['harfang']`. After deploying, register an account with the username **Harfang** so you get super-admin powers.

To add more super admins later, edit that line. Or use the in-app "Manage Admins" panel (visible to super admins only) to add regular admins.

---

## Step 4 — Push to GitHub

### 4.1 Create a GitHub account at [github.com](https://github.com) if you don't have one.

### 4.2 Create a new repository
- Repo name: `napl-stats`
- Visibility: **Private** (no need to be public)
- Don't initialize with a README (we already have one)

### 4.3 Push the code
GitHub will show you commands after creating the repo. Run them in this folder:
```bash
git init
git add .
git commit -m "Initial deployment"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/napl-stats.git
git push -u origin main
```

If `git` isn't installed: download from [git-scm.com](https://git-scm.com).

**IMPORTANT:** `.env` is in `.gitignore` so your Supabase keys are NOT pushed publicly. Good.

---

## Step 5 — Deploy to Vercel

### 5.1 Create a Vercel account
Go to [vercel.com](https://vercel.com), sign up with your GitHub account (easiest).

### 5.2 Import the project
- Click **Add New** → **Project**
- Find your `napl-stats` repo, click **Import**
- Framework Preset: should auto-detect as **Vite**
- Leave Build Command, Output Directory as defaults

### 5.3 Add environment variables
Before clicking Deploy, expand **Environment Variables** and add:
- `VITE_SUPABASE_URL` = same value as in your local `.env`
- `VITE_SUPABASE_ANON_KEY` = same value as in your local `.env`

### 5.4 Click Deploy
Wait 1-2 minutes. You'll get a live URL like `napl-stats-xyz.vercel.app`. Open it and verify the app works.

---

## Step 6 — Connect app.naplpso.com

### 6.1 In Vercel
- Open your project → **Settings** → **Domains**
- Type `app.naplpso.com` and click **Add**
- Vercel will give you DNS instructions, usually:
  - Type: `CNAME`
  - Name: `app`
  - Value: `cname.vercel-dns.com`

### 6.2 Add the DNS record at your domain provider
Wherever you manage `naplpso.com` (likely your WordPress hosting):
1. Find **DNS Settings** or **Manage DNS**
2. Add a new record:
   - Type: **CNAME**
   - Host/Name: **app**
   - Value/Target: `cname.vercel-dns.com` (use the exact value Vercel shows you)
   - TTL: leave default
3. Save

Wait 5-30 minutes for DNS to propagate. Then visit `app.naplpso.com` — it should load the app, served over HTTPS automatically.

---

## You're live

Every push to the `main` branch on GitHub auto-deploys to `app.naplpso.com`. To make code changes:
1. Edit files in this folder
2. `git add . && git commit -m "your message" && git push`
3. Wait ~1 minute, refresh the live site

---

## Costs

- **Supabase free tier:** 500 MB database, 1 GB storage, 50,000 monthly active users. Plenty for 200 users.
- **Vercel free tier:** 100 GB bandwidth/month, unlimited deployments.
- **Domain:** you already own naplpso.com.

Free indefinitely unless you hit hard caps (very unlikely for this scale).

---

## Common issues

**"Missing Supabase env vars" error**
→ You forgot to create `.env` (step 2.6) or didn't add env vars in Vercel (step 5.3).

**Can't sign up — "Email rate limit exceeded"**
→ Supabase Auth has rate limits on new emails. Wait an hour and try again, or upgrade to Pro ($25/month) for higher limits.

**Login works locally but not on Vercel**
→ Check Vercel env vars match your local `.env` exactly. Then redeploy (Vercel → Deployments → click latest → "Redeploy").

**"app.naplpso.com" loads WordPress instead of the app**
→ DNS hasn't propagated yet (wait up to 24 hours) OR you added the CNAME for the wrong subdomain. Check the host should be `app`, not `naplpso.com`.

---

## File structure

```
napl-deploy/
├── README.md                    ← this file
├── package.json                 ← dependencies
├── vite.config.js               ← build config
├── tailwind.config.js           ← styling config
├── postcss.config.js            ← CSS processing
├── index.html                   ← page shell
├── supabase-schema.sql          ← database structure (run once)
├── .env.example                 ← env var template
├── .gitignore                   ← what NOT to push
└── src/
    ├── main.jsx                 ← React entry point
    ├── index.css                ← global styles
    ├── App.jsx                  ← the entire app (5000+ lines)
    └── lib/
        └── supabase.js          ← database client
```

---

## Future feature changes

After deployment, most feature changes happen in `src/App.jsx`. You can edit it directly on GitHub via the web interface — no need to use a terminal. Just:

1. github.com → your repo → src/App.jsx → click the pencil icon
2. Make your edit
3. "Commit changes" at the bottom
4. Vercel auto-deploys in ~1 minute

If a change needs new database tables/columns, edit `supabase-schema.sql` and run the new bits in the Supabase SQL Editor.

---

## Getting help

If you get stuck, the most useful places to ask:
- Supabase issues → [Supabase Discord](https://discord.supabase.com)
- React/Vercel issues → ask an AI coding assistant (paste the error message)
- DNS issues → your domain provider's support
