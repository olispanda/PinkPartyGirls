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

  var slides = document.querySelectorAll(".slide[data-theme]");

  if (slides.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            document.body.dataset.theme = entry.target.dataset.theme;
          }
        });
      },
      { threshold: [0.5] }
    );

    slides.forEach(function (slide) {
      observer.observe(slide);
    });
  }
});
