# Deployment & Publishing Guide (Google AI Studio)

This web application (**Lina AI - Home Assistant**) is fully configured for publishing to Vercel or Replit using a **Google AI Studio Gemini API Key**.

---

## 1. Obtain Your Google AI Studio Key
1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Click **Create API key**.
3. Copy your key (starts with `AIzaSy...`).

---

## 2. Publish to Vercel (Recommended)

### Step A: Deploy the App
Run this command in your terminal:
```bash
npx vercel
```
*Follow the interactive prompt to log in and deploy.*

Or push your repo to GitHub and import it on [Vercel Dashboard](https://vercel.com/new).

### Step B: Configure Google AI Studio Key on Vercel
1. Go to your project on the [Vercel Dashboard](https://vercel.com).
2. Navigate to **Settings → Environment Variables**.
3. Add the following variable:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: *Your Google AI Studio key (`AIzaSy...`)*
4. Click **Save** and redeploy.

Your webapp will be live at `https://<your-project>.vercel.app` with live Gemini AI!

---

## 3. Option: Configure via App UI
Alternatively, users can set their key directly in the live web app:
1. Open your published app URL.
2. Go to **Settings → AI Providers**.
3. Expand **Google AI Studio (Gemini)** and paste your API key.
4. Click **Save**. The key is encrypted with **AES-256-GCM** and saved securely.

---

## Technical Architecture Overview
- **Frontend**: Vite + React + Tailwind CSS (`artifacts/ai-assistant`)
- **Backend API**: Express + Pino + Drizzle (`artifacts/api-server`) routed via `/api/*`
- **Serverless Entry**: `api/index.ts`
- **Vercel Config**: `vercel.json`
