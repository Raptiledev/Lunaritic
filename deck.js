(function () {
  const slides = Array.from(document.querySelectorAll(".slide"));
  const countEl = document.getElementById("count");
  const dotsEl = document.getElementById("dots");
  const frame = document.getElementById("demo-frame");
  const openApp = document.getElementById("open-app");
  const closeApp = document.getElementById("close-app");
  const TOTAL = slides.length;
  let index = 0;
  let demoMounted = false;

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function configuredUrl() {
    const params = new URLSearchParams(location.search);
    const fromQuery = (params.get("app") || "").trim();
    if (fromQuery) return fromQuery;
    const fromFile = (window.LUNARIS_DECK && window.LUNARIS_DECK.appUrl) || "";
    return String(fromFile).trim();
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

  function mountDemo() {
    if (demoMounted) return;
    demoMounted = true;
    const url = configuredUrl();
    setAppLinks(url);
    if (!url) {
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
      return;
    }
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

  function show(next, push) {
    index = Math.max(0, Math.min(TOTAL - 1, next));
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
    if (tag === "INPUT" || tag === "TEXTAREA") return;
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
  style.textContent = ".sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0}";
  document.head.appendChild(style);

  setAppLinks(configuredUrl());
  show(startIndex(), false);
})();
