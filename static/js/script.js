// ---------------------------
// Hamburger Menu & Overlay
// ---------------------------
const hamburger = document.getElementById("hamburger");
const sideNav = document.getElementById("sideNav");

const overlay = document.createElement("div");
overlay.id = "overlay";
document.body.appendChild(overlay);

hamburger.addEventListener("click", () => {
  sideNav.classList.toggle("active");
  overlay.classList.toggle("active");
});

overlay.addEventListener("click", () => {
  sideNav.classList.remove("active");
  overlay.classList.remove("active");
});

document.querySelectorAll(".side-nav a").forEach(link => {
  link.addEventListener("click", () => {
    sideNav.classList.remove("active");
    overlay.classList.remove("active");
  });
});

// ---------------------------
// Login Modal
// ---------------------------
const modal = document.getElementById("loginModal");
const loginBtnDesktop = document.getElementById("loginBtnDesktop");
const loginBtnMobile = document.getElementById("loginBtnMobile");
const closeModal = document.getElementById("closeModal");

loginBtnDesktop.addEventListener("click", (e) => {
  e.preventDefault();
  modal.style.display = "flex";
});
loginBtnMobile.addEventListener("click", (e) => {
  e.preventDefault();
  modal.style.display = "flex";
});

closeModal.addEventListener("click", () => {
  modal.style.display = "none";
});

window.addEventListener("click", (e) => {
  if (e.target === modal) {
    modal.style.display = "none";
  }
});

// ---------------------------
// Show/Hide Password
// ---------------------------
const togglePassword = document.getElementById("togglePassword");
const password = document.getElementById("password");

togglePassword.addEventListener("click", () => {
  const type = password.getAttribute("type") === "password" ? "text" : "password";
  password.setAttribute("type", type);
  togglePassword.textContent = type === "password" ? "👁️" : "🙈";
});

// ---------------------------
// Firebase Admin Login via Username
// ---------------------------
const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");

loginForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const username = usernameInput.value.trim();
  const pwd = password.value.trim();

  if (!username || !pwd) {
    alert("Please enter username and password.");
    return;
  }

  // Step 1: Get UID from /usernames/<username>
  const usernamesRef = firebase.database().ref("usernames");
  usernamesRef.child(username).get().then(uidSnap => {
    if (!uidSnap.exists()) {
      alert("Username not found.");
      return;
    }

    const uid = uidSnap.val();

    // Step 2: Get email from /users/<uid>/email
    const usersRef = firebase.database().ref("users");
    usersRef.child(uid).child("email").get().then(emailSnap => {
      if (!emailSnap.exists()) {
        alert("User email not found.");
        return;
      }

      const email = emailSnap.val();

      // Step 3: Sign in with Firebase Auth
      firebase.auth().signInWithEmailAndPassword(email, pwd)
        .then(userCredential => {
          const user = userCredential.user;

          // Step 4: Check approval status (/users/<uid>/isApproved)
          usersRef.child(uid).child("isApproved").get().then(approvalSnap => {
            let isApproved = false;
            if (approvalSnap.exists()) {
              isApproved = approvalSnap.val();
            }

            // Check email verification + admin approval
            if (!user.emailVerified || !isApproved) {
              // Redirect to pending page
              window.location.href = "/pending.html";
            } else {
              // Redirect to admin dashboard
              window.location.href = "/admin/dashboard.html";
            }

            modal.style.display = "none";
            loginForm.reset();
          }).catch(err => {
            console.error(err);
            alert("Error checking admin approval: " + err.message);
          });

        }).catch(err => {
          console.error(err);
          alert("Login failed: " + err.message);
        });

    }).catch(err => {
      console.error(err);
      alert("Error fetching email: " + err.message);
    });

  }).catch(err => {
    console.error(err);
    alert("Error fetching UID: " + err.message);
  });
});
