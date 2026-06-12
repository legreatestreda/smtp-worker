# Prospect Mail – SMTP Worker

This is a ~70-line Node.js service that turns HTTPS requests from the app
into actual SMTP sends via [Nodemailer]. The main app runs on Cloudflare
Workers, which cannot open raw TCP connections — that is the only reason
this exists.

## What it does

- Accepts `POST /send` with a JSON body containing your SMTP credentials
  and the email to send.
- Verifies a shared `Authorization: Bearer <WORKER_TOKEN>` header.
- Calls `nodemailer.sendMail(...)`.
- Also exposes `POST /health` which calls `transporter.verify()` so the app
  can test your settings.

## Deploy in 3 minutes (Fly.io, Railway, Render, any VPS)

1. Copy this `smtp-worker/` folder to its own repo or upload to your host.
2. Generate a long random `WORKER_TOKEN` (e.g. `openssl rand -hex 32`).
3. Set env vars on the host:
   - `WORKER_TOKEN` – the random string from step 2
   - `PORT` – optional, defaults to 8080
4. Install + run: `npm install && npm start`
5. Note the public HTTPS URL of your deployment (e.g.
   `https://prospect-smtp.fly.dev`).

### One-file Dockerfile (optional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json index.js ./
RUN npm install --omit=dev
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
```

## Wire it into the app

Open the app → **Settings** and fill in:

- **Worker URL**: `https://<your-host>/send`
- **Shared token**: the `WORKER_TOKEN` you set above
- **SMTP host / port / username / password / SSL**: your provider's values
  (Gmail App Password, Brevo, OVH, Office365, etc.)
- **From name / email**: what recipients see

Click **Test connection** to confirm.

## Security notes

- The shared token is the only thing protecting the worker — make it long
  and random, and keep it out of git.
- SMTP credentials live in your Supabase row (RLS-protected), travel over
  HTTPS to the worker, and are used immediately for one send. The worker
  never persists them.
- For extra safety, restrict your worker host's firewall to only accept
  traffic from your app's IPs, or front it with Cloudflare Access.

[Nodemailer]: https://nodemailer.com