(function () {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const countEl = document.getElementById("count");
  const dotsEl = document.getElementById("dots");
  const frame = document.getElementById("demo-frame");
  const openApp = document.getElementById("open-app");
  const closeApp = document.getElementById("close-app");
  const toggle = document.getElementById("demo-toggle");
  const TOTAL = slides.length;
  let index = 0;
  let demoMounted = false;
  let demoMode = null; // "video" or "app"

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function configured(param, key) {
    const params = new URLSearchParams(location.search);
    const fromQuery = (params.get(param) || "").trim();
    if (fromQuery) return fromQuery;
    const fromFile = (window.LUNARIS_DECK && window.LUNARIS_DECK[key]) || "";
    return String(fromFile).trim();
  }

  function configuredUrl() {
    return configured("app", "appUrl");
  }

  function configuredVideo() {
    return configured("video", "videoUrl");
  }

  // A video file (hosted next to the deck or elsewhere) plays in a <video> tag.
  function isVideoFile(url) {
    return /\.(mp4|webm|mov|m4v)([?#]|$)/i.test(url);
  }

  // Turn an ordinary share link into the address that is allowed inside an iframe.
  function toEmbed(url) {
    try {
      const u = new URL(url, location.href);
      const host = u.hostname.replace(/^www\./, "");
      const yt = function (id) { return "https://www.youtube-nocookie.com/embed/" + id + "?rel=0"; };
      if (host === "youtu.be" && u.pathname.length > 1) return yt(u.pathname.slice(1));
      if (host === "youtube.com" || host === "m.youtube.com") {
        if (u.pathname === "/watch" && u.searchParams.get("v")) return yt(u.searchParams.get("v"));
        const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/?]+)/);
        if (m) return yt(m[2]);
      }
      if (host === "loom.com") {
        const m = u.pathname.match(/^\/share\/([^/?]+)/);
        if (m) return "https://www.loom.com/embed/" + m[1];
      }
      if (host === "drive.google.com") {
        const m = u.pathname.match(/^\/file\/d\/([^/]+)/);
        if (m) return "https://drive.google.com/file/d/" + m[1] + "/preview";
      }
      return u.toString();
    } catch (e) {
      return url;
    }
  }

  function setAppLinks(url) {
    [openApp, closeApp].forEach(function (node) {
      if (!node) return;
      if (url) {
        node.href = url;
        node.classList.remove("is-disabled");
        node.removeAttribute("aria-disabled");
      } else {
        node.href = "#";
        node.classList.add("is-disabled");
        node.setAttribute("aria-disabled", "true");
      }
    });
  }

  function renderSetup() {
    frame.innerHTML =
      '<form class="demo-empty" id="demo-setup">' +
        "<p class=\"eyebrow\">Waiting for a public address</p>" +
        "<h2>The live console embeds in this slide.</h2>" +
        "<p>Space Apps keeps the file off their site. Put the public console URL here, or add it to <span style=\"font-family:var(--mono);color:var(--bone)\">deck/config.js</span> before you submit the deck link. A query also works: <span style=\"font-family:var(--mono);color:var(--bone)\">?app=https://…</span></p>" +
        '<div class="demo-form">' +
          '<label class="sr" for="app-url">Console URL</label>' +
          '<input id="app-url" name="app" type="url" required placeholder="https://your-console.example.com" />' +
          '<button class="btn" type="submit">Embed</button>' +
        "</div>" +
      "</form>";
    const form = document.getElementById("demo-setup");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      const next = new URL(location.href);
      next.searchParams.set("app", form.app.value.trim());
      location.href = next.toString();
    });
  }

  function renderApp(url) {
    frame.innerHTML = '<p class="demo-status quiet">Opening the console…</p>';
    const iframe = document.createElement("iframe");
    iframe.title = "LUNARIS live console";
    iframe.src = url;
    iframe.referrerPolicy = "no-referrer-when-downgrade";
    iframe.addEventListener("load", function () {
      const status = frame.querySelector(".demo-status");
      if (status) status.remove();
    });
    frame.appendChild(iframe);
  }

  function renderVideo(url) {
    frame.innerHTML = "";
    if (isVideoFile(url)) {
      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.preload = "metadata";
      video.setAttribute("aria-label", "LUNARIS short demo video");
      frame.appendChild(video);
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.title = "LUNARIS short demo video";
    iframe.src = toEmbed(url);
    iframe.setAttribute("data-video", "");
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);
  }

  function renderDemo() {
    const app = configuredUrl();
    const video = configuredVideo();
    if (demoMode === "video") renderVideo(video);
    else renderApp(app);
    if (!toggle) return;
    if (app && video) {
      toggle.hidden = false;
      toggle.textContent = demoMode === "video" ? "Try the live app" : "Watch the short demo";
    } else {
      toggle.hidden = true;
    }
  }

  function mountDemo() {
    if (demoMounted) return;
    demoMounted = true;
    const app = configuredUrl();
    const video = configuredVideo();
    setAppLinks(app);
    if (!app && !video) {
      renderSetup();
      return;
    }
    // The video is shown first when there is one: it always plays, even if the live app is slow or offline.
    demoMode = video ? "video" : "app";
    renderDemo();
  }

  // Stop a playing video when the audience moves to another slide.
  function quietDemo() {
    if (!frame) return;
    frame.querySelectorAll("video").forEach(function (v) { v.pause(); });
    frame.querySelectorAll("iframe[data-video]").forEach(function (f) { f.src = f.src; });
  }

  if (toggle) {
    toggle.addEventListener("click", function () {
      demoMode = demoMode === "video" ? "app" : "video";
      renderDemo();
    });
  }

  function show(next, push) {
    const before = index;
    index = Math.max(0, Math.min(TOTAL - 1, next));
    if (before !== index && slides[before].hasAttribute("data-demo")) quietDemo();
    slides.forEach(function (slide, i) {
      const on = i === index;
      slide.classList.toggle("is-active", on);
      slide.hidden = !on;
    });
    countEl.textContent = pad(index + 1) + " / " + pad(TOTAL);
    dotsEl.querySelectorAll("button").forEach(function (button, i) {
      if (i === index) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
    const hash = "#" + (index + 1);
    if (push) history.pushState({ slide: index }, "", hash);
    else history.replaceState({ slide: index }, "", hash);
    document.title = "LUNARIS — slide " + (index + 1) + " of " + TOTAL;
    if (slides[index].hasAttribute("data-demo")) mountDemo();
  }

  slides.forEach(function (slide, i) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Slide " + (i + 1) + (slide.getAttribute("aria-label") ? ": " + slide.getAttribute("aria-label") : ""));
    button.addEventListener("click", function () { show(i, true); });
    li.appendChild(button);
    dotsEl.appendChild(li);
  });

  document.getElementById("prev").addEventListener("click", function () { show(index - 1, true); });
  document.getElementById("next").addEventListener("click", function () { show(index + 1, true); });

  document.addEventListener("keydown", function (event) {
    const tag = (event.target && event.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "VIDEO") return;
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key === " ") {
      event.preventDefault();
      show(index + 1, true);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      show(index - 1, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      show(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      show(TOTAL - 1, true);
    }
  });

  window.addEventListener("popstate", function (event) {
    const stored = event.state && typeof event.state.slide === "number" ? event.state.slide : null;
    show(stored === null ? startIndex() : stored, false);
  });

  function startIndex() {
    const n = Number(String(location.hash || "").replace("#", ""));
    if (n >= 1 && n <= TOTAL) return n - 1;
    return 0;
  }

  const style = document.createElement("style");
  style.textContent =
    ".sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}" +
    ".demo-frame video{position:absolute;inset:0;width:100%;height:100%;background:#04060a;object-fit:contain}" +
    ".demo-actions{display:flex;align-items:center;gap:16px}" +
    "button.text-link{border:0;border-bottom:1px solid var(--faint);padding:0 0 1px;font-family:inherit;font-size:14px;cursor:pointer}" +
    "button.text-link[hidden]{display:none}";
  document.head.appendChild(style);

  setAppLinks(configuredUrl());
  show(startIndex(), false);
})();