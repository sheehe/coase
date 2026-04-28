(function () {
  "use strict";

  // ───────────────────────── i18n ─────────────────────────
  const SUPPORTED = ["zh", "en"];
  const STORAGE_KEY = "coase_lang";

  function detectInitial() {
    // 优先用户上次手动选择 → 浏览器语言（zh-* 命中走 zh）→ 默认 EN
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && SUPPORTED.includes(saved)) return saved;
    } catch (_) {}
    const nav = (navigator.language || navigator.userLanguage || "").toLowerCase();
    if (nav.startsWith("zh")) return "zh";
    return "en";
  }

  function apply(lang) {
    if (!SUPPORTED.includes(lang)) lang = "en";
    const dict = window.I18N && window.I18N[lang];
    if (!dict) return;

    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    localStorage.setItem(STORAGE_KEY, lang);

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      const key = el.getAttribute("data-i18n");
      if (dict[key] !== undefined) el.textContent = dict[key];
    });

    document.querySelectorAll("[data-i18n-attr]").forEach(function (el) {
      const pairs = el.getAttribute("data-i18n-attr").split(",");
      pairs.forEach(function (pair) {
        const [attr, key] = pair.split(":").map(function (s) {
          return s.trim();
        });
        if (attr && key && dict[key] !== undefined) {
          el.setAttribute(attr, dict[key]);
        }
      });
    });

    // Update title and meta description
    if (dict["meta.title"]) document.title = dict["meta.title"];
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && dict["meta.description"]) {
      metaDesc.setAttribute("content", dict["meta.description"]);
    }

    // Update toggle UI
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.classList.toggle(
        "active",
        btn.getAttribute("data-lang-btn") === lang
      );
    });
  }

  function initLanguage() {
    apply(detectInitial());
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        apply(btn.getAttribute("data-lang-btn"));
      });
    });
  }

  // ─────────────────────── Scroll reveal ───────────────────────
  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll(".reveal").forEach(function (el) {
        el.classList.add("visible");
      });
      return;
    }
    const obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            obs.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "-8% 0px -8% 0px", threshold: 0.01 }
    );
    document.querySelectorAll(".reveal").forEach(function (el) {
      obs.observe(el);
    });
  }

  // ─────────────────────── Mobile nav ───────────────────────
  function initMobileNav() {
    const toggle = document.querySelector("[data-mobile-toggle]");
    const overlay = document.querySelector("[data-mobile-overlay]");
    if (!toggle || !overlay) return;

    function close() {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
    }

    toggle.addEventListener("click", function () {
      overlay.classList.toggle("open");
      document.body.style.overflow = overlay.classList.contains("open")
        ? "hidden"
        : "";
    });

    overlay.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", close);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
  }

  // ─────────────────────── OS detection ───────────────────────
  function initOSDetect() {
    const ua = navigator.userAgent || "";
    const isMac = /Mac|iPhone|iPad|iPod/.test(ua);
    const primary = document.querySelector("[data-download-primary]");
    if (!primary) return;
    primary.setAttribute(
      "data-detected-os",
      isMac ? "macos" : "windows"
    );
  }

  // ─────────────────────── Boot ───────────────────────
  function boot() {
    initLanguage();
    initReveal();
    initMobileNav();
    initOSDetect();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
