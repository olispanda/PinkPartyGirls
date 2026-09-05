document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav__toggle");
  var links = document.querySelector(".nav__links");

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      document.body.classList.toggle("nav-open");
    });

    links.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        document.body.classList.remove("nav-open");
      });
    });
  }

  // Note: this used to track the active slide's theme on document.body so
  // CSS could swap the nav/footer colour per section. Both now use
  // mix-blend-mode: difference instead (see .nav / .mini-footer in
  // style.css), which reacts per-pixel without any JS bookkeeping.
});
