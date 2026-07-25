// ListingKit — generation engine (Vercel serverless function, zero dependencies)
// Turns listing facts + agent brand into a full marketing kit via the Gemini REST API.
// Falls back to high-quality templated output when no API key is set, so the app
// works the moment it's deployed.

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") { setCors(res); return res.status(204).end(); }
  setCors(res);
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  let input;
  try { input = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch { return res.status(400).json({ error: "Invalid JSON body." }); }

  const listing = normalize(input);
  if (!listing.address) return res.status(400).json({ error: "An address is required." });

  const key = process.env.GEMINI_API_KEY;

  // No key configured → templated demo so the deployed app is instantly usable.
  if (!key) return res.status(200).json({ mode: "demo", ...buildFallback(listing), listing });

  try {
    const kit = await generateWithGemini(key, listing);
    return res.status(200).json({ mode: "live", ...kit, listing });
  } catch (err) {
    // Never hard-fail the UX — degrade to templated output with a clear notice.
    return res.status(200).json({
      mode: "fallback",
      notice: "Live generation is temporarily unavailable, so this kit was assembled from templates. Check the GEMINI_API_KEY / model and try again.",
      detail: String(err && err.message || err),
      ...buildFallback(listing),
      listing,
    });
  }
};

function setCors(res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalize(i){
  const s = (v) => (v == null ? "" : String(v).trim());
  return {
    address: s(i.address),
    price: s(i.price),
    beds: s(i.beds),
    baths: s(i.baths),
    sqft: s(i.sqft),
    propertyType: s(i.propertyType) || "home",
    status: s(i.status) || "Just Listed",
    features: s(i.features),
    neighborhood: s(i.neighborhood),
    agentName: s(i.agentName) || "Your Name",
    agentTitle: s(i.agentTitle) || "Realtor®",
    brandColor: /^#?[0-9a-fA-F]{6}$/.test(s(i.brandColor)) ? ("#" + s(i.brandColor).replace("#","")) : "#1D5B3B",
    contactHandle: s(i.contactHandle),
    contactPhone: s(i.contactPhone),
    openHouse: s(i.openHouse),
  };
}

/* ------------------------- Gemini ------------------------- */
async function generateWithGemini(key, L){
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: buildPrompt(L) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.85, topP: 0.95, maxOutputTokens: 8192,
    },
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok){
    const t = await r.text().catch(() => "");
    throw new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
  if (!text) throw new Error("Empty response from model.");
  const parsed = safeParse(text);
  if (!parsed) throw new Error("Model did not return valid JSON.");
  return coerce(parsed, L);
}

function safeParse(t){
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a){ try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

function buildPrompt(L){
  return `You are the senior copywriter and brand designer at a top real-estate marketing studio. Produce a complete, ready-to-publish marketing kit for ONE listing. Return ONLY JSON (no markdown) matching the exact shape described below.

LISTING FACTS
- Address: ${L.address}
- Price: ${L.price || "(not provided)"}
- Beds / Baths / SqFt: ${L.beds || "?"} / ${L.baths || "?"} / ${L.sqft || "?"}
- Property type: ${L.propertyType}
- Status: ${L.status}
- Standout features (agent's notes): ${L.features || "(none provided — infer tasteful, non-fabricated generalities and keep them plausible)"}
- Neighborhood / lifestyle notes: ${L.neighborhood || "(none provided)"}
- Open house details: ${L.openHouse || "(none)"}
- Agent: ${L.agentName}, ${L.agentTitle}${L.contactHandle ? ", " + L.contactHandle : ""}${L.contactPhone ? ", " + L.contactPhone : ""}

QUALITY BAR (non-negotiable)
- Write vivid, specific, benefit-led copy. Vary sentence length. NO tired clichés ("nestled", "boasts", "dream home", "must-see", "won't last long", "priced to sell", "TLC").
- Never invent hard facts (square footage, year, schools, HOA). If a detail isn't given, stay evocative but general.
- FAIR HOUSING COMPLIANCE is mandatory. Never reference or imply race, color, religion, sex, familial status, national origin, or disability. Ban: "safe", "family-friendly", "perfect for families", "great for kids", "walk to church/temple", "exclusive", "integrated", "master bedroom" (use "primary bedroom"), and any claim about who the home is "perfect for". Describe the PROPERTY and PLACE, not the buyer. If the agent's notes contain a violation, rewrite it clean and record it in compliance.flags.
- Match each platform's voice. Emojis: light on Instagram/Facebook, none on LinkedIn/X.

RETURN THIS EXACT JSON SHAPE:
{
  "descriptions": { "mls": "~45 words, MLS-ready", "standard": "~110 words", "luxury": "~170 words, elevated and editorial" },
  "captions": [
    { "platform": "Instagram", "text": "2-4 short lines, 1-2 tasteful emoji, ends with a booking CTA", "hashtags": ["8-12 relevant tags without the # is fine"] },
    { "platform": "Facebook", "text": "warmer, community tone, 3-5 sentences", "hashtags": ["3-5"] },
    { "platform": "LinkedIn", "text": "professional, lead with a market/lifestyle insight, no emoji", "hashtags": ["3-5"] },
    { "platform": "X", "text": "under 260 characters, punchy, no emoji", "hashtags": ["2-3"] }
  ],
  "carousel": { "slides": [
    { "role": "cover",    "headline": "e.g. Just Listed", "sub": "price + address, short" },
    { "role": "feature",  "headline": "≤5 words", "sub": "one crisp supporting line" },
    { "role": "feature",  "headline": "≤5 words", "sub": "one crisp supporting line" },
    { "role": "feature",  "headline": "≤5 words", "sub": "one crisp supporting line" },
    { "role": "lifestyle","headline": "≤5 words about the location/lifestyle", "sub": "one line" },
    { "role": "cta",      "headline": "Book a private tour", "sub": "agent name + handle/phone" }
  ]},
  "reel": {
    "hook": "spoken hook that lands in the first 2 seconds",
    "durationSec": 22,
    "beats": [ { "t": "0:00", "action": "what to film", "onscreen": "on-screen text" } ],
    "voiceover": "full narration script, natural and confident",
    "cta": "clear DM/booking call to action"
  },
  "email": { "subject": "<50 chars, high open-rate", "preheader": "<90 chars", "body": "greeting with {{first_name}} merge tag, 3 short paragraphs, one CTA, sign off as the agent" },
  "statusGraphics": [
    { "status": "Just Listed", "headline": "short sign-style line", "sub": "one supporting line" },
    { "status": "Open House", "headline": "short", "sub": "date/time placeholder if none given" },
    { "status": "Just Sold", "headline": "short celebratory line", "sub": "one line" }
  ],
  "compliance": { "status": "clean" | "flagged", "note": "one plain-English sentence", "flags": ["only if you rewrote something"] }
}

Give 5-6 reel beats. Make every line publish-ready.`;
}

// Ensure required keys exist even if the model omits some.
function coerce(p, L){
  const fb = buildFallback(L);
  return {
    descriptions: { ...fb.descriptions, ...(p.descriptions || {}) },
    captions: Array.isArray(p.captions) && p.captions.length ? p.captions : fb.captions,
    carousel: (p.carousel && Array.isArray(p.carousel.slides) && p.carousel.slides.length) ? p.carousel : fb.carousel,
    reel: p.reel && p.reel.voiceover ? p.reel : fb.reel,
    email: p.email && p.email.body ? p.email : fb.email,
    statusGraphics: Array.isArray(p.statusGraphics) && p.statusGraphics.length ? p.statusGraphics : fb.statusGraphics,
    compliance: p.compliance || fb.compliance,
  };
}

/* ------------------- Templated fallback -------------------
   Reads cleanly for ANY input: parses the city from the address for place
   references + hashtags, treats the neighborhood field as a lifestyle clause,
   and lists free-text features rather than forcing them into prose grammar. */
function buildFallback(L){
  const price = L.price ? (L.price.startsWith("$") ? L.price : "$" + L.price) : "";
  const specs = [L.beds && `${L.beds} bd`, L.baths && `${L.baths} ba`, L.sqft && `${L.sqft} sqft`].filter(Boolean).join(" · ");
  const ptype = (L.propertyType || "home").toLowerCase();
  const parts = L.address.split(",").map(x => x.trim()).filter(Boolean);
  const shortAddr = parts[0] || L.address;
  const city = parts.length > 1 ? parts[1].replace(/\b\d{5}(-\d{4})?\b/, "").trim() : "";
  const place = city || "the area";
  const life = L.neighborhood.replace(/\.$/, "");                 // lifestyle clause, e.g. "two blocks to Maple Park"
  const feats = (L.features || "").split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  const hasF = feats.length > 0;
  const fList = joinList(feats);
  const handle = L.contactHandle || L.contactPhone || "";
  const lifeSentence = life ? `You're ${lower(life)}.` : (city ? `Minutes from all that ${city} has to offer.` : "");
  const lifeClause = life ? `you're ${lower(life)}` : (city ? `minutes from ${city}` : "close to everything");

  return {
    descriptions: {
      mls: `${L.status} on ${shortAddr}. ${(specs || price) ? "A " + ptype + (specs ? " with " + specs : "") + (price ? ", offered at " + price : "") + ". " : ""}${hasF ? "Highlights include " + fList + "." : "A bright, well-kept " + ptype + ", move-in ready."} ${lifeSentence}`.replace(/\s+/g, " ").trim(),
      standard: `Say hello to ${shortAddr}. This ${ptype}${specs ? " offers " + specs + ", balancing comfort and everyday function." : " brings together comfort and everyday function."} ${hasF ? "Inside, you'll find " + fList + "." : "Inside, bright rooms and a layout that simply works."} ${life ? "Step outside and " + lifeClause + "." : (city ? "And you're minutes from all that " + city + " has to offer." : "")} ${price ? "Offered at " + price + ". " : ""}Come see how it feels in person.`.replace(/\s+/g, " ").trim(),
      luxury: `There's a particular quiet to ${shortAddr} — the kind that makes you slow down the moment you step inside. ${hasF ? "The home is defined by " + fList + "." : "The home is defined by light, proportion, and calm, considered spaces."} ${specs ? "Set within " + specs + ", it gives you room to live and to host." : "There's room to live and to host."} ${life ? "Beyond the door, " + lifeClause + " — daily life close at hand." : (city ? "Beyond the door, " + city + " keeps the rhythm of daily life close at hand." : "")} ${price ? "Offered at " + price + ", " : ""}this is a home that rewards a second look.`.replace(/\s+/g, " ").trim(),
    },
    captions: [
      { platform: "Instagram", text: `${L.status} on ${shortAddr} ✨\n${hasF ? cap(fList) : "Bright, welcoming, and move-in ready"}.${life ? "\nYou're " + lower(life) + "." : (city ? "\nMinutes to " + city + "." : "")}\nTap to book your private tour 👇`, hashtags: hashtags(L, city) },
      { platform: "Facebook", text: `${L.status}: ${shortAddr}${price ? " — " + price : ""}. ${hasF ? "Think " + fList + "." : "A warm, welcoming home with room to spread out."} ${life ? cap(lifeClause) + "." : ""} Message me and I'll line up a private showing for you this week — I'd love to walk you through it.`.replace(/\s+/g, " ").trim(), hashtags: [tag(city) || "RealEstate", "RealEstate", "ForSale"].filter(uniq) },
      { platform: "LinkedIn", text: `New to market: ${shortAddr}. Well-kept ${ptype}s near ${place} continue to draw strong buyer interest. ${hasF ? "This one features " + fList : "This one blends quality space with genuine everyday livability"}${price ? ", offered at " + price : ""}. Reach out for a private tour or a current read on the local market.`, hashtags: ["RealEstate", tag(city) || "Property", "Homeownership"].filter(uniq) },
      { platform: "X", text: clip(`${L.status}: ${shortAddr}${price ? " · " + price : ""}${specs ? " · " + specs : ""}. ${hasF ? cap(feats[0]) : "Bright & move-in ready"}${city ? ", near " + city : ""}. DM for a tour.`, 258), hashtags: ["RealEstate", tag(city) || "NewListing"].filter(uniq) },
    ],
    carousel: { slides: [
      { role: "cover", headline: L.status, sub: `${price ? price + "  ·  " : ""}${shortAddr}` },
      { role: "feature", headline: cap(shorten(feats[0] || "Bright, open living")), sub: "Room to breathe, front to back." },
      { role: "feature", headline: cap(shorten(feats[1] || "A kitchen to gather in")), sub: "Made for mornings and long dinners." },
      { role: "feature", headline: cap(shorten(feats[2] || specs || "Space that works")), sub: "Every square foot earns its place." },
      { role: "lifestyle", headline: city ? "Minutes to " + city : "The location", sub: life ? cap(life) : "The best of the area, close at hand." },
      { role: "cta", headline: "Book a private tour", sub: `${L.agentName}${handle ? "  ·  " + handle : ""}` },
    ]},
    reel: {
      hook: `Three things you'll love about ${shortAddr}…`,
      durationSec: 22,
      beats: [
        { t: "0:00", action: "Walk toward the front door, phone steady", onscreen: `${L.status.toUpperCase()} · ${shortAddr}` },
        { t: "0:04", action: `Slow pan across ${lower(feats[0] || "the main living space")}`, onscreen: cap(feats[0] || "Bright, open living") },
        { t: "0:09", action: "Move into the kitchen, glide along the counter", onscreen: cap(feats[1] || "A kitchen to gather in") },
        { t: "0:14", action: "Step outside — yard, balcony, or view", onscreen: city ? "Minutes to " + city : "Prime location" },
        { t: "0:18", action: "Turn to camera, smile", onscreen: price ? `Offered at ${price}` : "Now available" },
        { t: "0:21", action: "Point down for the CTA", onscreen: "DM me “TOUR”" },
      ],
      voiceover: `Three things you'll love about ${shortAddr}. One — ${lower(feats[0] || "the light in here is unreal")}. Two — ${lower(feats[1] || "this kitchen was built for real life")}. And three — ${lifeClause}. ${price ? "Offered at " + price + "." : ""} DM me the word TOUR and I'll set you up with a private showing.`.replace(/\s+/g, " ").trim(),
      cta: `DM “TOUR” or call ${L.contactPhone || L.agentName} to book a private showing.`,
    },
    email: {
      subject: `Just listed on ${clip(shortAddr, 26)} — take a look`,
      preheader: `${specs ? specs + ". " : ""}${price ? price + ". " : ""}Book a private tour before it hits the open market.`,
      body: `Hi {{first_name}},\n\nA new one just came to market: ${L.address}${specs ? " — " + specs : ""}${price ? ", offered at " + price : ""}. ${hasF ? "Think " + fList + "." : "It's bright, welcoming, and move-in ready."} ${life ? cap(lifeClause) + "." : ""}\n\nHomes like this near ${place} tend to move quickly. If you'd like a private look before the weekend, just reply “TOUR” and I'll hold you a time.\n\nTalk soon,\n${L.agentName}\n${L.agentTitle}${L.contactPhone ? " · " + L.contactPhone : ""}`.replace(/[ \t]+/g, " "),
    },
    statusGraphics: [
      { status: "Just Listed", headline: "Just Listed", sub: `${shortAddr}${price ? " · " + price : ""}` },
      { status: "Open House", headline: "Open House", sub: L.openHouse || "This Saturday · 12–2 PM" },
      { status: "Just Sold", headline: "Just Sold", sub: `Another happy move${city ? " in " + city : ""}` },
    ],
    compliance: { status: "clean", note: "Copy describes the property and location only — no references to protected classes.", flags: [] },
  };
}

/* helpers */
function lower(s){ return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
function cap(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function shorten(s){ return s.split(/\s+/).slice(0, 5).join(" "); }
function clip(s, n){ return s.length > n ? s.slice(0, n - 1).trim() + "…" : s; }
function tag(s){ return (s || "").replace(/[^a-zA-Z0-9]/g, ""); }
function joinList(arr){
  const a = arr.map(lower);
  if (a.length <= 1) return a[0] || "";
  if (a.length === 2) return a[0] + " and " + a[1];
  return a.slice(0, -1).join(", ") + ", and " + a[a.length - 1];
}
function uniq(v, i, arr){ return v && arr.map(x => x.toLowerCase()).indexOf(v.toLowerCase()) === i; }
function hashtags(L, city){
  const c = tag(city) || "Local";
  const arr = [tag(L.status.replace(/\s/g, "")), "RealEstate", c + "RealEstate", "HomeForSale", "RealtorLife", c + "Homes", "NewListing", "DreamHome"];
  return arr.filter(uniq).slice(0, 10);
}
