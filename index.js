import http from "node:http";
import nodemailer from "nodemailer";

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.WORKER_TOKEN;

// 🔐 Fail fast si config manquante
if (!TOKEN) {
  console.error("FATAL: WORKER_TOKEN env var is required.");
  process.exit(1);
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function checkAuth(req) {
  const auth = req.headers["authorization"] || "";

  if (!auth.startsWith("Bearer ")) return false;

  const token = auth.slice(7).trim();
  return token === TOKEN;
}

function transporterFrom(smtp) {
  if (!smtp) throw new Error("Missing SMTP config");

  const { host, port, username, password, secure } = smtp;

  if (!host || !username || !password) {
    throw new Error("Missing SMTP credentials");
  }

  return nodemailer.createTransport({
    host,
    port: Number(port) || 587,
    secure: secure === true || secure === "true",
    auth: {
      user: username,
      pass: password,
    },
  });
}

function validateSendPayload(body) {
  if (!body) throw new Error("Empty body");

  const { from, to, subject } = body;

  if (!from) throw new Error("Missing 'from'");
  if (!to) throw new Error("Missing 'to'");
  if (!subject) throw new Error("Missing 'subject'");
}

const server = http.createServer(async (req, res) => {
  try {
    // 🌐 CORS preflight (utile si app web)
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }

    // 🔐 AUTH GLOBAL
    if (!checkAuth(req)) {
      return json(res, 401, { error: "Unauthorized" });
    }

    // 🩺 HEALTH CHECK SMTP
    if (req.method === "POST" && req.url === "/health") {
      const body = await readBody(req);
      const tx = transporterFrom(body.smtp);

      await tx.verify();

      return json(res, 200, { ok: true });
    }

    // 📩 SEND EMAIL
    if (req.method === "POST" && (req.url === "/send" || req.url === "/")) {
      const body = await readBody(req);

      validateSendPayload(body);

      const { smtp, from, to, subject, html, text } = body;

      const tx = transporterFrom(smtp);

      const info = await tx.sendMail({
        from,
        to,
        subject,
        html,
        text,
      });

      return json(res, 200, {
        ok: true,
        messageId: info.messageId,
      });
    }

    return json(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("[smtp-worker error]", err);

    return json(res, 500, {
      error: err?.message || "Internal server error",
    });
  }
});

server.listen(PORT, () => {
  console.log(`SMTP worker running on port ${PORT}`);
});

