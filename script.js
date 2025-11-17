const hamburger = document.getElementById("hamburger");
const sideNav = document.getElementById("sideNav");

// Create overlay
const overlay = document.createElement("div");
overlay.id = "overlay";
document.body.appendChild(overlay);

hamburger.addEventListener("click", () => {
  sideNav.classList.toggle("active");
  overlay.classList.toggle("active");
});

// Close menu when clicking outside
overlay.addEventListener("click", () => {
  sideNav.classList.remove("active");
  overlay.classList.remove("active");
});

// Close menu when clicking a link
document.querySelectorAll(".side-nav a").forEach(link => {
  link.addEventListener("click", () => {
    sideNav.classList.remove("active");
    overlay.classList.remove("active");
  });
});
