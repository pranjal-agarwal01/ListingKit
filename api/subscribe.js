// ListingKit — email capture (Vercel serverless function, zero dependencies)
// Forwards captured emails to a webhook you control (SUBSCRIBE_WEBHOOK_URL),
// e.g. a Google Apps Script bound to a Google Sheet. If no webhook is set, it
// logs to the function output so nothing is silently lost during setup.

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res); return res.status(204).end(); }
  cors(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch { return res.status(400).json({ error: "Invalid JSON body." }); }

  const email = String(body.email || "").trim().slice(0, 200);
  const source = String(body.source || "").trim().slice(0, 60);
  if (!isEmail(email)) return res.status(400).json({ error: "Please enter a valid email." });

  const record = { email: email, source: source, ts: new Date().toISOString() };
  const hook = process.env.SUBSCRIBE_WEBHOOK_URL;

  if (!hook) {
    // Not configured yet — surface it in the logs so early signups aren't lost.
    console.log("[subscribe] no SUBSCRIBE_WEBHOOK_URL set. Captured:", JSON.stringify(record));
    return res.status(200).json({ ok: true, stored: false });
  }

  try {
    const r = await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      redirect: "follow",
    });
    // Google Apps Script returns 200/302; treat non-5xx as success.
    if (r.status >= 500) throw new Error("webhook " + r.status);
    return res.status(200).json({ ok: true, stored: true });
  } catch (err) {
    console.log("[subscribe] webhook failed:", String(err && err.message || err), "record:", JSON.stringify(record));
    // Don't fail the visitor's experience — we still logged the email above.
    return res.status(200).json({ ok: true, stored: false });
  }
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
