// ---------------------------
// DASHBOARD.JS (Realtime Version)
// ---------------------------
window.addEventListener("DOMContentLoaded", () => {
  // ---------------------------
  // DOM Elements
  // ---------------------------
  const totalUsersElem = document.getElementById("totalUsers");
  const pendingUsersElem = document.getElementById("pendingUsers");
  const activeReportsElem = document.getElementById("activeReports");

  // ---------------------------
  // REAL-TIME DASHBOARD LISTENERS
  // ---------------------------

  function setupRealtimeUsersListeners() {
    const usersRef = db.ref("users");

    // Listen for changes in users
    usersRef.on("value", (snapshot) => {
      let totalUsers = 0;
      let pendingApprovals = 0;

      snapshot.forEach((childSnap) => {
        const data = childSnap.val();
        if (data?.role === "user") totalUsers++;
        if (data?.isApproved === false) pendingApprovals++;
      });

      totalUsersElem.textContent = totalUsers;
      pendingUsersElem.textContent = pendingApprovals;
    }, (error) => {
      console.error("Error fetching users in real-time:", error);
      totalUsersElem.textContent = "Error";
      pendingUsersElem.textContent = "Error";
    });
  }

  function setupRealtimeReportsListener() {
    const reportsRef = db.ref("reports");

    // Listen for changes in reports
    reportsRef.on("value", (snapshot) => {
      let activeReports = 0;

      snapshot.forEach((childSnap) => {
        const data = childSnap.val();
        if (data?.status !== "responded") activeReports++;
      });

      activeReportsElem.textContent = activeReports;
    }, (error) => {
      console.error("Error fetching reports in real-time:", error);
      activeReportsElem.textContent = "Error";
    });
  }

  // ---------------------------
  // INIT DASHBOARD DATA
  // ---------------------------
  window.initDashboard = function(userRole) {
    if (userRole === "admin") {
      setupRealtimeUsersListeners();
      setupRealtimeReportsListener();
    } else {
      console.warn("Dashboard data not loaded. User is not an admin.");
      totalUsersElem.textContent = "-";
      pendingUsersElem.textContent = "-";
      activeReportsElem.textContent = "-";
    }
  };
});
