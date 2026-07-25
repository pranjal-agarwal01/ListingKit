/* ListingKit — front-end for the generator */
(function () {
  "use strict";
  var H2I = window.htmlToImage || null;
  var form = document.getElementById("kitform");
  var results = document.getElementById("results");
  var stage = document.getElementById("stage");
  var toastEl = document.getElementById("toast");

  /* ---- small DOM helper ---- */
  function el(tag, props, children) {
    var n = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      if (k === "class") n.className = props[k];
      else if (k === "html") n.innerHTML = props[k];
      else if (k === "style") n.setAttribute("style", props[k]);
      else if (k.slice(0, 2) === "on" && typeof props[k] === "function") n.addEventListener(k.slice(2), props[k]);
      else if (props[k] != null) n.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) {
      if (c == null) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }

  /* ---- brand color <-> hex sync + open-house toggle ---- */
  var color = document.getElementById("brandColor");
  var hex = document.getElementById("brandColorHex");
  color.addEventListener("input", function () { hex.value = color.value.toUpperCase(); });
  hex.addEventListener("input", function () {
    var v = hex.value.trim(); if (/^#?[0-9a-fA-F]{6}$/.test(v)) color.value = "#" + v.replace("#", "");
  });
  var statusSel = document.getElementById("status");
  var ohField = document.getElementById("ohfield");
  statusSel.addEventListener("change", function () {
    ohField.hidden = statusSel.value !== "Open House";
  });

  /* ---- toast + copy ---- */
  var toastT;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("show"); }, 1900);
  }
  function copy(text, label) {
    var done = function () { toast((label || "Copied") + " ✓"); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    else { legacyCopy(text); done(); }
  }
  function legacyCopy(text) {
    var t = document.createElement("textarea"); t.value = text; t.style.position = "fixed"; t.style.left = "-9999px";
    document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(t);
  }
  function copyBtn(getText, label) {
    return el("button", { class: "btn btn-ghost btn-sm", onclick: function () { copy(getText(), label); } }, [icon("copy"), "Copy"]);
  }

  /* ---- icons ---- */
  function icon(name) {
    var p = {
      copy: "M9 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4M5 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z",
      text: "M4 6h16M4 12h16M4 18h9", chat: "M4 5h16v11H8l-4 4z", grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
      play: "M8 5v14l11-7z", mail: "M3 6h18v12H3zM4 7l8 6 8-6", sign: "M6 3h12v5H6zM12 8v13M8 21h8", download: "M12 3v12M7 11l5 5 5-5M5 21h14"
    }[name] || "";
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("width", "16"); svg.setAttribute("height", "16");
    svg.setAttribute("fill", "none"); svg.setAttribute("class", "ic");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "1.9");
    path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path); return svg;
  }

  /* ---- color math ---- */
  function hexToRgb(h) { h = h.replace("#", ""); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x))); }
  function darken(h, amt) { var c = hexToRgb(h); return "rgb(" + c.map(function (v) { return clamp(v * (1 - amt)); }).join(",") + ")"; }
  function lighten(h, amt) { var c = hexToRgb(h); return "rgb(" + c.map(function (v) { return clamp(v + (255 - v) * amt); }).join(",") + ")"; }
  function luminance(h) { var c = hexToRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function formatPrice(raw) {
    if (!raw) return "";
    var s = String(raw).trim();
    var digits = s.replace(/[^0-9.]/g, "");
    if (!digits) return s;
    var mult = /m/i.test(s) ? 1e6 : /k/i.test(s) ? 1e3 : 1;
    var n = Math.round(parseFloat(digits) * mult);
    if (isNaN(n)) return s;
    return "$" + n.toLocaleString("en-US");
  }

  /* ================= submit ================= */
  var LOADING = ["Reading the listing…", "Writing descriptions…", "Crafting captions…", "Designing the carousel…", "Scripting the reel…", "Screening for compliance…"];
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var data = collect();
    if (!data.address) { toast("Add a property address first"); document.getElementById("address").focus(); return; }
    runLoading();
    fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error(res.j && res.j.error || "Generation failed.");
        render(res.j, data);
      })
      .catch(function (err) {
        results.innerHTML = "";
        results.appendChild(el("div", { class: "notice warn" }, ["⚠️ " + err.message + " — please try again."]));
      });
  });

  function collect() {
    var g = function (id) { var n = document.getElementById(id); return n ? n.value.trim() : ""; };
    return {
      address: g("address"), price: g("price"), beds: g("beds"), baths: g("baths"), sqft: g("sqft"),
      propertyType: g("propertyType"), status: g("status"), features: g("features"), neighborhood: g("neighborhood"),
      openHouse: g("openHouse"), agentName: g("agentName"), agentTitle: g("agentTitle"),
      contactHandle: g("contactHandle"), contactPhone: g("contactPhone"), brandColor: g("brandColorHex") || g("brandColor"),
    };
  }

  function runLoading() {
    results.innerHTML = "";
    var step = el("div", { class: "step" }, [LOADING[0]]);
    results.appendChild(el("div", { class: "loading" }, [el("div", { class: "spin" }), step]));
    var i = 0;
    var iv = setInterval(function () { i = (i + 1) % LOADING.length; step.textContent = LOADING[i]; }, 1200);
    results._iv = iv;
  }

  /* ================= render ================= */
  function render(d, input) {
    if (results._iv) clearInterval(results._iv);
    results.innerHTML = "";
    var brand = /^#?[0-9a-fA-F]{6}$/.test((input.brandColor || "").replace("#", "")) ? "#" + input.brandColor.replace("#", "") : "#1D5B3B";
    var specs = [input.beds && input.beds + " bd", input.baths && input.baths + " ba", input.sqft && input.sqft + " sqft"].filter(Boolean).join("  ·  ");
    var ctx = {
      brand: brand, agentName: input.agentName || "Your Name",
      handle: input.contactHandle || input.contactPhone || "", status: input.status || "Just Listed",
      price: formatPrice(input.price), addr: (input.address || "").split(",")[0].trim(), specs: specs,
    };

    // mode notices
    if (d.mode === "demo") results.appendChild(el("div", { class: "notice demo" }, [
      "✨ ", el("span", null, ["Preview mode — this kit is templated from your inputs. Add your "]),
      el("b", null, ["GEMINI_API_KEY"]), el("span", null, [" in Vercel to switch on live AI generation."])]));
    if (d.mode === "fallback") results.appendChild(el("div", { class: "notice warn" }, ["⚠️ " + (d.notice || "Used template fallback.")]));

    // compliance
    var comp = d.compliance || { status: "clean", note: "" };
    var cb = el("div", { class: "compliance-banner" + (comp.status === "flagged" ? " flagged" : "") }, [
      icon("sign"), el("span", null, [el("b", null, [comp.status === "flagged" ? "Fair Housing: rewritten. " : "Fair Housing: clean. "]), comp.note || ""])]);
    results.appendChild(cb);

    results.appendChild(descriptionsBlock(d.descriptions || {}));
    results.appendChild(captionsBlock(d.captions || []));
    results.appendChild(carouselBlock(d.carousel && d.carousel.slides || [], ctx));
    results.appendChild(reelBlock(d.reel || {}));
    results.appendChild(emailBlock(d.email || {}));
    results.appendChild(statusBlock(d.statusGraphics || [], ctx));

    results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function block(title, iconName, body, headExtra) {
    return el("div", { class: "block" }, [
      el("div", { class: "block-head" }, [el("h3", null, [icon(iconName), title]), headExtra || null]),
      el("div", { class: "block-body" }, [body]),
    ]);
  }

  /* descriptions with tabs */
  function descriptionsBlock(desc) {
    var keys = [["mls", "MLS"], ["standard", "Standard"], ["luxury", "Luxury"]];
    var body = el("div");
    var text = el("div", { class: "copytext" });
    var current = "standard";
    var tabs = el("div", { class: "tabs" });
    function paint() { text.textContent = desc[current] || "—"; Array.prototype.forEach.call(tabs.children, function (t) { t.classList.toggle("on", t.dataset.k === current); }); }
    keys.forEach(function (k) { tabs.appendChild(el("button", { class: "tab", type: "button", "data-k": k[0], onclick: function () { current = k[0]; paint(); } }, [k[1]])); });
    body.appendChild(tabs); body.appendChild(text);
    body.appendChild(el("div", { class: "copybar" }, [copyBtn(function () { return desc[current] || ""; }, "Description copied")]));
    paint();
    return block("Listing description", "text", body);
  }

  /* captions grid */
  function captionsBlock(caps) {
    var grid = el("div", { class: "caps" });
    caps.forEach(function (c) {
      var tags = (c.hashtags || []).map(function (t) { return t[0] === "#" ? t : "#" + t; }).join(" ");
      var full = c.text + (tags ? "\n\n" + tags : "");
      grid.appendChild(el("div", { class: "capcard" }, [
        el("div", { class: "plat" }, [c.platform || ""]),
        el("div", { class: "copytext" }, [c.text || ""]),
        tags ? el("div", { class: "hashrow" }, [tags]) : null,
        el("div", { class: "copybar" }, [copyBtn(function () { return full; }, (c.platform || "Caption") + " copied")]),
      ]));
    });
    return block("Social captions", "chat", grid);
  }

  /* ---- square graphic builder (1080x1080) ---- */
  function makeSquare(o) {
    var light = luminance(o.brand) > 0.62;
    var textCol = light ? "#15221A" : "#ffffff";
    var bg = "radial-gradient(120% 130% at 82% 8%, " + (light ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.14)") + ", transparent 55%), linear-gradient(150deg, " + darken(o.brand, 0.20) + ", " + o.brand + ")";
    var pad = el("div", { class: "sq-pad", style: "color:" + textCol });

    if (o.rider) {
      pad.appendChild(el("div", { class: "sq-rider", style: "background:" + (light ? "#15221A" : "#ffffff") + ";color:" + (light ? "#ffffff" : darken(o.brand, 0.12)) }, [o.rider]));
    } else {
      pad.appendChild(el("div", { class: "sq-accent", style: "background:" + (light ? "rgba(21,34,26,.85)" : "rgba(255,255,255,.9)") }));
    }
    pad.appendChild(el("div", { class: "gap" }));
    pad.appendChild(el("div", { class: "sq-head" + (o.big ? " big" : "") }, [o.headline || ""]));
    if (o.sub) pad.appendChild(el("div", { class: "sq-sub", style: "margin-top:26px" }, [o.sub]));
    pad.appendChild(el("div", { class: "gap" }));
    var footBorder = light ? "rgba(21,34,26,.25)" : "rgba(255,255,255,.28)";
    pad.appendChild(el("div", { class: "sq-foot", style: "border-color:" + footBorder }, [
      el("div", null, [
        el("div", { class: "an" }, [o.footName || ""]),
        o.footHandle ? el("div", { class: "ah" }, [o.footHandle]) : null,
      ]),
      el("div", { class: "sq-wm" }, ["◆ ListingKit"]),
    ]));
    return el("div", { class: "square", style: "background:" + bg }, [pad]);
  }

  function slideToOpts(s, ctx) {
    var role = s.role || "feature";
    if (role === "cover") return {
      brand: ctx.brand, rider: ctx.status,
      headline: ctx.price || ctx.addr || ctx.status,
      sub: ctx.price ? [ctx.addr, ctx.specs].filter(Boolean).join("  ·  ") : ctx.specs,
      big: true, footName: ctx.agentName, footHandle: ctx.handle,
    };
    if (role === "cta") return { brand: ctx.brand, headline: s.headline || "Book a private tour", sub: s.sub || "", footName: ctx.agentName, footHandle: ctx.handle };
    return { brand: ctx.brand, headline: s.headline || "", sub: s.sub || "", footName: "", footHandle: "" };
  }

  function carouselBlock(slides, ctx) {
    var strip = el("div", { class: "strip" });
    slides.forEach(function (s, i) {
      var opts = slideToOpts(s, ctx);
      var node = makeSquare(opts);
      node.style.transform = "scale(" + (230 / 1080) + ")";
      var prev = el("div", { class: "slide-preview" }, [node]);
      strip.appendChild(el("div", { class: "slidewrap" }, [
        prev,
        el("div", { class: "slide-dl" }, [el("button", { class: "btn btn-ghost btn-sm", onclick: function () { exportSquare(function () { return makeSquare(opts); }, "listingkit-slide-" + (i + 1) + ".png"); } }, [icon("download"), "PNG"])]),
        el("div", { class: "slide-n" }, [(i + 1) + " / " + slides.length]),
      ]));
    });
    var dlAll = el("button", { class: "btn btn-primary btn-sm", onclick: function () { exportAll(slides, ctx); } }, [icon("download"), "Download all"]);
    return block("Instagram carousel", "grid", strip, dlAll);
  }

  function reelBlock(reel) {
    var body = el("div");
    body.appendChild(el("div", { class: "reel-hook" }, ["“" + (reel.hook || "") + "”"]));
    var rows = (reel.beats || []).map(function (b) {
      return el("tr", null, [el("td", { class: "t" }, [b.t || ""]), el("td", null, [b.action || ""]), el("td", { class: "os" }, [b.onscreen || ""])]);
    });
    body.appendChild(el("table", { class: "beats" }, [
      el("thead", null, [el("tr", null, [el("th", null, ["Time"]), el("th", null, ["Film"]), el("th", null, ["On-screen"])])]),
      el("tbody", null, rows),
    ]));
    body.appendChild(el("div", { class: "sublabel" }, ["Voiceover"]));
    body.appendChild(el("div", { class: "copytext" }, [reel.voiceover || ""]));
    var full = "HOOK: " + (reel.hook || "") + "\n\nVOICEOVER: " + (reel.voiceover || "") + "\n\nCTA: " + (reel.cta || "");
    body.appendChild(el("div", { class: "copybar" }, [copyBtn(function () { return full; }, "Reel script copied")]));
    return block("Reel / video script", "play", body);
  }

  function emailBlock(email) {
    var body = el("div");
    body.appendChild(el("div", { class: "email-meta" }, [el("b", null, ["Subject: "]), email.subject || ""]));
    if (email.preheader) body.appendChild(el("div", { class: "email-meta" }, [el("b", null, ["Preview: "]), email.preheader]));
    body.appendChild(el("div", { class: "copytext", style: "margin-top:10px" }, [email.body || ""]));
    var full = "Subject: " + (email.subject || "") + "\n\n" + (email.body || "");
    body.appendChild(el("div", { class: "copybar" }, [copyBtn(function () { return full; }, "Email copied")]));
    return block("Email to your list", "mail", body);
  }

  function statusBlock(list, ctx) {
    var row = el("div", { class: "statusrow" });
    list.forEach(function (g, i) {
      var opts = { brand: ctx.brand, rider: g.status || g.headline, headline: g.headline || g.status || "", sub: g.sub || "", big: false, footName: ctx.agentName, footHandle: ctx.handle };
      var node = makeSquare(opts); node.style.transform = "scale(" + (230 / 1080) + ")";
      row.appendChild(el("div", { class: "slidewrap", style: "width:230px" }, [
        el("div", { class: "slide-preview" }, [node]),
        el("div", { class: "slide-dl" }, [el("button", { class: "btn btn-ghost btn-sm", onclick: function () { exportSquare(function () { return makeSquare(opts); }, "listingkit-" + (g.status || "graphic").toLowerCase().replace(/\s+/g, "-") + ".png"); } }, [icon("download"), "PNG"])]),
      ]));
    });
    return block("Status graphics", "sign", row);
  }

  /* ---- PNG export ---- */
  function exportSquare(builder, filename) {
    if (!H2I) { toast("Image export unavailable offline"); return; }
    var node = builder();
    stage.innerHTML = ""; stage.appendChild(node);
    toast("Rendering PNG…");
    H2I.toPng(node, { width: 1080, height: 1080, pixelRatio: 1, cacheBust: true, backgroundColor: "#ffffff" })
      .then(function (url) { stage.innerHTML = ""; triggerDownload(url, filename); toast("Downloaded ✓"); })
      .catch(function (e) { stage.innerHTML = ""; toast("Export failed — try again"); });
  }
  function exportAll(slides, ctx) {
    if (!H2I) { toast("Image export unavailable offline"); return; }
    var i = 0;
    function next() {
      if (i >= slides.length) { toast("All slides downloaded ✓"); return; }
      var opts = slideToOpts(slides[i], ctx); var idx = i; i++;
      var node = makeSquare(opts); stage.innerHTML = ""; stage.appendChild(node);
      H2I.toPng(node, { width: 1080, height: 1080, pixelRatio: 1, cacheBust: true, backgroundColor: "#ffffff" })
        .then(function (url) { stage.innerHTML = ""; triggerDownload(url, "listingkit-slide-" + (idx + 1) + ".png"); setTimeout(next, 350); })
        .catch(function () { stage.innerHTML = ""; setTimeout(next, 100); });
    }
    toast("Rendering " + slides.length + " slides…"); next();
  }
  function triggerDownload(url, name) { var a = el("a", { href: url, download: name }); document.body.appendChild(a); a.click(); document.body.removeChild(a); }
})();
