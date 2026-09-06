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

  // The nav/footer normally use mix-blend-mode: difference to stay legible
  // over any slide. Over the hero video that reads as a muddy near-black, so
  // there we want the nav to just be plain pink — toggle a body class while
  // the home slide fills most of the viewport.
  var hero = document.querySelector(".slide-home");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(
      function (entries) {
        document.body.classList.toggle("over-hero", entries[0].isIntersecting);
      },
      { threshold: 0.5 }
    ).observe(hero);
  }
});
