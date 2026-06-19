# Put your app online — step by step (no coding)

Goal: take this `uphex-mvp` folder and turn it into a real website with its own web
address, for free. Total time: about 15 minutes. You'll use two free websites:

1. **GitHub** — stores your code online.
2. **Render** — runs your code and gives it a public URL.

You do NOT need to install anything or type any commands. Everything is done in your
web browser by clicking.

---

## Part 1 — Put the code on GitHub (~7 min)

1. Go to **https://github.com** and click **Sign up** (or **Sign in** if you have an account).
   It's free. Verify your email if asked.

2. Once logged in, click the **+** in the top-right corner → **New repository**.

3. Fill in:
   - **Repository name:** `adlaunch-mvp`
   - Leave it set to **Public** (Render's free plan reads public repos easily).
   - Do NOT check "Add a README."
   - Click **Create repository**.

4. On the next page you'll see a link that says **"uploading an existing file"**
   (in the line "…or upload an existing file"). Click it.

5. Open the `uphex-mvp` folder on your computer. Select **everything inside it**
   (the `server.js` file, the `public` folder, the `src` folder, `package.json`,
   `render.yaml`, etc.) and **drag it all** onto the GitHub upload page.
   - Tip: it's important to upload the *contents* of `uphex-mvp`, not the folder itself,
     so that `server.js` ends up at the top level of the repository.

6. Wait for the files to finish uploading, then scroll down and click **Commit changes**.

✅ Your code is now on GitHub.

---

## Part 2 — Run it on Render (~7 min)

1. Go to **https://render.com** and click **Get Started** → sign up with your GitHub
   account (click "GitHub" and approve). This links the two so Render can see your code.

2. In the Render dashboard, click **New +** (top right) → **Web Service**.

3. Render will list your GitHub repositories. Find **adlaunch-mvp** and click **Connect**.
   (If you don't see it, click "Configure account" and give Render access to the repo.)

4. Render reads the included `render.yaml` and fills most things in. Confirm:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type / Plan:** **Free**

5. Click **Create Web Service** (or **Deploy**).

6. Watch the log. After a minute or two you'll see your server start. At the top of the
   page Render shows your live URL, something like:

   **https://adlaunch-mvp.onrender.com**

7. Click it. Your Ad Launch Portal is now live on the internet. 🎉

---

## What you'll see

The site opens in **mock mode** — fully clickable, with fake Meta data, so you (and
anyone you share the link with) can try the whole flow: Connect → pick a template →
Launch → see the Dashboard and Leads. Nothing touches a real Facebook account yet.

## A couple of things to know

- **Free plan sleeps.** After ~15 minutes of no visitors, the free Render service goes to
  sleep, so the *first* visit afterward takes ~30 seconds to wake up. Normal for free tier.
- **Going live for real.** To launch actual Facebook ads, you must flip `META_MODE` to
  `live` in Render (Dashboard → your service → Environment) and add your Meta app
  credentials — but only **after** Meta approves your app. See
  `Meta_App_Review_Submission.docx`.
- **Updating the site later.** Change a file on GitHub (or re-upload), and Render
  automatically redeploys. No extra steps.

## If you get stuck

The most common snag is step 5 of Part 1: make sure `server.js` is at the *top* of the
repository, not inside another `uphex-mvp` folder. If Render's log says
"Cannot find module" or "no start command," that's almost always the cause — re-upload
the *contents* of the folder.
