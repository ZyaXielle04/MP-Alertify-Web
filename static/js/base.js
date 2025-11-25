// ---------------------------
// RUN AFTER DOM IS LOADED
// ---------------------------
window.addEventListener("DOMContentLoaded", () => {

  // ---------------------------
  // DOM Elements
  // ---------------------------
  const logoutBtn = document.getElementById("logoutBtn");

  // ---------------------------
  // AUTH CHECK & ROLE VERIFICATION
  // ---------------------------
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      // Not logged in, redirect to login
      window.location.href = "/index.html";
      return;
    }

    const uid = user.uid;

    try {
      // Get the role of the authenticated user
      const roleSnapshot = await db.ref(`users/${uid}/role`).get();
      const role = roleSnapshot.val(); 

      if (role !== "admin") {
        alert("Access denied. Admins only.");
        await auth.signOut();
        window.location.href = "/index.html";
        return;
      }

      // ✅ User is admin, initialize dashboard and pass role
      if (typeof initDashboard === "function") {
        initDashboard(role);
      }

    } catch (error) {
      console.error("Error checking user role:", error);
      alert("Failed to verify user role. Logging out.");
      await auth.signOut();
      window.location.href = "/index.html";
    }
  });

  // ---------------------------
  // LOGOUT FUNCTION
  // ---------------------------
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      try {
        await auth.signOut();
        window.location.href = "/index.html";
      } catch (error) {
        console.error("Logout failed:", error);
        alert("Logout failed: " + error.message);
      }
    });
  }

});
