import http from "node:http";
import nodemailer from "nodemailer";

const PORT = process.env.PORT || 8080;
const TOKEN = process.env.WORKER_TOKEN;

if (!TOKEN) {
  console.error("FATAL: WORKER_TOKEN env var is required.");
  process.exit(1);
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error("Invalid JSON body"); }
}

function transporterFrom(smtp) {
  if (!smtp?.host || !smtp?.username || !smtp?.password) {
    throw new Error("Missing SMTP credentials");
  }
  return nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port) || 587,
    secure: Boolean(smtp.secure),
    auth: { user: smtp.username, pass: smtp.password },
  });
}

const server = http.createServer(async (req, res) => {
  // Auth
  const auth = req.headers["authorization"] || "";
  if (auth !== `Bearer ${TOKEN}`) return json(res, 401, { error: "Unauthorized" });

  try {
    if (req.method === "POST" && req.url === "/health") {
      const body = await readBody(req);
      const tx = transporterFrom(body.smtp);
      await tx.verify();
      return json(res, 200, { ok: true });
    }

    if (req.method === "POST" && (req.url === "/" || req.url === "/send")) {
      const body = await readBody(req);
      const { smtp, from, to, subject, html, text } = body;
      if (!from || !to || !subject) return json(res, 400, { error: "from, to, subject required" });

      const tx = transporterFrom(smtp);
      const info = await tx.sendMail({ from, to, subject, html, text });
      return json(res, 200, { ok: true, messageId: info.messageId });
    }

    return json(res, 404, { error: "Not found" });
  } catch (e) {
    console.error("[smtp-worker]", e);
    return json(res, 500, { error: e?.message || "Internal error" });
  }
});

server.listen(PORT, () => {
  console.log(`SMTP worker listening on :${PORT}`);
});