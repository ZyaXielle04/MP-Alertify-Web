window.addEventListener("DOMContentLoaded", () => {

  const hamburger = document.getElementById("hamburger");
  const sideNav = document.getElementById("sideNav");

  if (hamburger && sideNav) {
    hamburger.addEventListener("click", () => sideNav.classList.toggle("closed"));
  }

  function initDashboard(role) {
    const usersContainer = document.getElementById("usersContainer");
    const usersRef = db.ref("users");

    // Only users with role "user"
    usersRef.orderByChild("role").equalTo("user").on("value", snapshot => {
      const users = snapshot.val();
      usersContainer.innerHTML = "";

      if (!users) {
        usersContainer.innerHTML = "<p>No users found.</p>";
        return;
      }

      Object.keys(users).forEach(uid => {
        const user = users[uid];
        const card = document.createElement("div");
        card.classList.add("user-card");

        const verifiedIcon = user.isApproved ? " ✅" : "";
        const disabledText = user.disabled ? " (Disabled)" : "";

        // Dynamically render buttons based on approval status
        let actionButtons = `<button class="card-btn view-details-btn">View More Details</button>`;
        if (!user.isApproved) {
          actionButtons += `<button class="card-btn approve-btn">Approve</button>`;
          actionButtons += `<button class="card-btn resubmit-btn">Resubmit ID</button>`;
        } else {
          actionButtons += `<button class="card-btn disable-btn">${user.disabled ? 'Enable' : 'Disable'}</button>`;
        }

        card.innerHTML = `
          <h3>${user.username || '-'}${verifiedIcon}${disabledText}</h3>
          <p><strong>Name:</strong> ${user.name || '-'}</p>
          <p><strong>Email:</strong> ${user.email || '-'}</p>
          <p><strong>UID:</strong> ${uid}</p>
          ${actionButtons}
        `;

        usersContainer.appendChild(card);

        // ---------- VIEW DETAILS ----------
        const viewBtn = card.querySelector(".view-details-btn");
        viewBtn.addEventListener("click", () => {
          Swal.fire({
            title: `${user.username} — Full Details`,
            width: "750px",
            heightAuto: false,
            customClass: { popup: "user-details-popup", htmlContainer: "user-details-html" },
            html: `
              <div class="details-wrapper">
                <div class="detail-group">
                  <p><strong>Name:</strong> ${user.name}</p>
                  <p><strong>Email:</strong> ${user.email}</p>
                  <p><strong>Age:</strong> ${user.age}</p>
                  <p><strong>Contact:</strong> ${user.contact}</p>
                  <p><strong>Home Address:</strong> ${user.homeAddress}</p>
                  <p><strong>Present Address:</strong> ${user.presentAddress}</p>
                </div>
                <hr/>
                <div class="image-group">
                  <p><strong>ID Front:</strong></p>
                  <img src="${user.idFrontUrl}" class="swal-img">
                  <p><strong>ID Back:</strong></p>
                  <img src="${user.idBackUrl}" class="swal-img">
                  <p><strong>Selfie:</strong></p>
                  <img src="${user.selfieUrl}" class="swal-img">
                </div>
              </div>
            `,
            confirmButtonText: "Close",
            showCancelButton: false
          });
        });

        // ---------- APPROVE BUTTON ----------
        const approveBtn = card.querySelector(".approve-btn");
        if (approveBtn) {
          approveBtn.addEventListener("click", async () => {
            Swal.fire({
              title: 'Approve User?',
              text: `Are you sure you want to approve ${user.username}?`,
              icon: 'warning',
              showCancelButton: true,
              confirmButtonColor: '#3085d6',
              cancelButtonColor: '#d33',
              confirmButtonText: 'Yes, approve'
            }).then(async (result) => {
              if (result.isConfirmed) {
                try {
                  await db.ref(`users/${uid}/isApproved`).set(true);
                  const usernameElem = card.querySelector("h3");
                  usernameElem.textContent = `${user.username} ✅`;
                  approveBtn.remove();
                  const resubmitBtn = card.querySelector(".resubmit-btn");
                  if (resubmitBtn) resubmitBtn.remove();
                  Swal.fire('Approved!', `${user.username} has been approved.`, 'success');
                } catch (err) {
                  console.error(err);
                  Swal.fire('Error!', 'Failed to approve user.', 'error');
                }
              }
            });
          });
        }

        // ---------- RESUBMIT ID BUTTON ----------
        const resubmitBtn = card.querySelector(".resubmit-btn");
        if (resubmitBtn) {
          resubmitBtn.addEventListener("click", async () => {
            Swal.fire({
              title: "Require ID Resubmission?",
              text: `This will prompt ${user.username} to re-upload ID images.`,
              icon: "warning",
              showCancelButton: true,
              confirmButtonText: "Yes, require resubmission"
            }).then(async (result) => {
              if (result.isConfirmed) {
                try {
                  await db.ref(`users/${uid}`).update({
                    resubmitID: true,
                    isApproved: false
                  });
                  Swal.fire(
                    "Success",
                    `${user.username} must now resubmit ID. Approval reset.`,
                    "success"
                  );
                } catch (err) {
                  console.error(err);
                  Swal.fire("Error!", "Failed to update user data.", "error");
                }
              }
            });
          });
        }

        // ---------- DISABLE / ENABLE BUTTON ----------
        const disableBtn = card.querySelector(".disable-btn");
        if (disableBtn) {
          disableBtn.addEventListener("click", async () => {
            const action = user.disabled ? "enable" : "disable";

            Swal.fire({
              title: `${action.charAt(0).toUpperCase() + action.slice(1)} User?`,
              text: `Are you sure you want to ${action} ${user.username}?`,
              icon: 'warning',
              showCancelButton: true,
              confirmButtonText: `Yes, ${action}`,
              cancelButtonText: "Cancel"
            }).then(async (result) => {
              if (result.isConfirmed) {
                try {
                  // Call your Python backend
                  const res = await fetch("https://mp-alertify-web.onrender.com/disable_user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ uid: uid, disable: !user.disabled })
                  });
                  const data = await res.json();
                  if (data.success) {
                    // Update UI immediately
                    user.disabled = !user.disabled;
                    disableBtn.textContent = user.disabled ? "Enable" : "Disable";
                    const usernameElem = card.querySelector("h3");
                    usernameElem.textContent = `${user.username}${user.isApproved ? " ✅" : ""}${user.disabled ? " (Disabled)" : ""}`;
                    Swal.fire('Success!', data.message, 'success');
                  } else {
                    Swal.fire('Error!', data.error, 'error');
                  }
                } catch (err) {
                  console.error(err);
                  Swal.fire('Error!', 'Failed to update user status.', 'error');
                }
              }
            });
          });
        }

      });
    });
  }

  window.initDashboard = initDashboard;

});
