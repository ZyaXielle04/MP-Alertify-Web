document.addEventListener("DOMContentLoaded", () => {
    const reportsTableBody = document.getElementById("reportsTableBody");
    let currentUserRole = "user"; // default role

    // --------------------------------------------------------
    // Inject CSS for image hover zoom (scale 2.5) and modal
    // --------------------------------------------------------
    const imgStyle = document.createElement("style");
    imgStyle.innerHTML = `
        #reportsTableBody img {
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: 6px;
            transition: transform 0.25s ease-in-out;
            cursor: pointer;
        }

        #reportsTableBody img:hover {
            transform: scale(2.5);
            z-index: 9999;
            position: relative;
        }

        /* Modal styling */
        #reporterModal {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 500px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            display: none;
            padding: 20px;
        }

        #reporterModal img {
            max-width: 100%;
            margin-top: 10px;
            border-radius: 6px;
        }

        #reporterModalClose {
            position: absolute;
            top: 10px;
            right: 15px;
            cursor: pointer;
            font-weight: bold;
            font-size: 18px;
        }
    `;
    document.head.appendChild(imgStyle);

    // --------------------------------------------------------
    // Modal container
    // --------------------------------------------------------
    const modal = document.createElement("div");
    modal.id = "reporterModal";
    modal.innerHTML = `
        <span id="reporterModalClose">&times;</span>
        <div id="reporterModalContent"></div>
    `;
    document.body.appendChild(modal);

    const modalContent = document.getElementById("reporterModalContent");
    const modalClose = document.getElementById("reporterModalClose");

    modalClose.addEventListener("click", () => {
        modal.style.display = "none";
    });

    // ---------------------------
    // Get current user role
    // ---------------------------
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            const uid = user.uid;
            const userSnap = await db.ref("users/" + uid + "/role").get();
            if (userSnap.exists()) {
                currentUserRole = userSnap.val();
            }
        }
        fetchReports();
    });

    // ---------------------------
    // Update Report Status
    // ---------------------------
    async function updateStatus(reportId, newStatus) {
        try {
            await db.ref("reports/" + reportId).update({ status: newStatus });
            fetchReports();
        } catch (err) {
            console.error("Error updating status:", err);
        }
    }

    // ---------------------------
    // Publicize Report
    // ---------------------------
    async function publicizeReport(reportId) {
        if (!reportId) return;
        try {
            const response = await fetch("/publicize_report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reportId })
            });
            const result = await response.json();
            if (result.success) {
                alert("Report publicized & notifications sent!");
            } else {
                alert("Error publicizing report: " + result.error);
            }
        } catch (err) {
            console.error("Error calling publicize_report endpoint:", err);
            alert("Failed to publicize report.");
        }
    }

    // ---------------------------
    // Status Badge
    // ---------------------------
    function getStatusBadge(status) {
        const colors = {
            "pending": "#7f8c8d",
            "Rejected": "#e74c3c",
            "Respond": "#f1c40f",
            "onRoute": "#3498db",
            "Responded": "#2ecc71"
        };
        return `<span class="badge" style="
            background:${colors[status] || '#7f8c8d'};
            padding:6px 10px;
            border-radius:6px;
            color:white;
            font-size:12px;
        ">${status}</span>`;
    }

    // ---------------------------
    // Fetch Reports
    // ---------------------------
    async function fetchReports() {
        db.ref("reports").on("value", async (reportsSnap) => {
            try {
                const usersSnap = await db.ref("users").get();

                if (!reportsSnap.exists()) {
                    reportsTableBody.innerHTML = `
                        <tr><td colspan="8" style="text-align:center;">No reports found</td></tr>
                    `;
                    return;
                }

                const reports = reportsSnap.val();
                const users = usersSnap.exists() ? usersSnap.val() : {};
                reportsTableBody.innerHTML = "";

                for (let id in reports) {
                    const r = reports[id];
                    const reporterId = r.reporter;
                    const user = users[reporterId] || {};

                    const name = user.name || "Unknown User";
                    const contact = user.contact || "N/A";
                    const emergency = r.emergency === "Others" ? r.otherEmergency : r.emergency;
                    const org = r.organization || "N/A";
                    const description = r.additionalMessage || "No description";
                    const imageHtml = r.imageUrl ? `<img src="${r.imageUrl}" alt="Attachment">` : `<span>No Image</span>`;

                    // ---------------------------
                    // LOCATION
                    // ---------------------------
                    let displayLocation = "N/A";
                    if (r.locationType === "HomeAddress") {
                        displayLocation = user.homeAddress || "No Home Address";
                    } else if (r.locationType === "PresentAddress") {
                        displayLocation = user.presentAddress || "No Present Address";
                    } else {
                        let loc = r.location || "Unknown Location";
                        const match = loc.match(/Lat:\s*([-\d.]+),\s*Lng:\s*([-\d.]+)/);
                        if (match) {
                            const lat = match[1];
                            const lng = match[2];
                            displayLocation = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank">${lat}, ${lng}</a>`;
                        } else displayLocation = loc;
                    }

                    // ---------------------------
                    // STATUS BUTTONS
                    // ---------------------------
                    let statusButtons = "";
                    switch (r.status) {
                        case "pending":
                            statusButtons = `<button class="btn gray" data-action="reject" data-id="${id}">Reject</button>
                                             <button class="btn yellow" data-action="respond" data-id="${id}">Respond</button>`;
                            break;
                        case "Respond":
                            statusButtons = `<button class="btn blue" data-action="onroute" data-id="${id}">On Route</button>`;
                            break;
                        case "onRoute":
                            statusButtons = `<button class="btn green" data-action="responded" data-id="${id}">Responded</button>`;
                            break;
                        default:
                            statusButtons = "";
                    }

                    let publicizeHtml = "";
                    if (currentUserRole === "admin") {
                        publicizeHtml = `<button class="btn purple" data-action="publicize" data-id="${id}">Publicize</button>`;
                    }

                    const statusHtml = `
                        ${getStatusBadge(r.status)}<br>
                        ${statusButtons}<br>
                        ${publicizeHtml}
                    `;

                    // ---------------------------
                    // TABLE ROW
                    // ---------------------------
                    const row = `
                        <tr>
                            <td>
                                <span class="reporter-name"
                                      data-id="${reporterId}"
                                      data-emergency="${emergency}"
                                      data-description="${description}"
                                      data-location="${displayLocation}"
                                      data-image="${r.imageUrl || ''}"
                                      style="cursor:pointer; color:#3498db; text-decoration:underline;">
                                    ${name}
                                </span>
                            </td>
                            <td>${emergency}</td>
                            <td>${description}</td>
                            <td>${org}</td>
                            <td>${imageHtml}</td>
                            <td>${contact}</td>
                            <td>${displayLocation}</td>
                            <td>${statusHtml}</td>
                        </tr>
                    `;
                    reportsTableBody.insertAdjacentHTML("beforeend", row);
                }

                // ---------------------------
                // STATUS BUTTON HANDLER
                // ---------------------------
                document.querySelectorAll(".btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const reportId = btn.dataset.id;
                        const action = btn.dataset.action;

                        if (action === "reject") updateStatus(reportId, "Rejected");
                        if (action === "respond") updateStatus(reportId, "Respond");
                        if (action === "onroute") updateStatus(reportId, "onRoute");
                        if (action === "responded") updateStatus(reportId, "Responded");
                        if (action === "publicize") publicizeReport(reportId);
                    });
                });

                // ---------------------------
                // CLICK MODAL (Reporter Info + Report Details)
                // ---------------------------
                document.querySelectorAll(".reporter-name").forEach(span => {
                    span.addEventListener("click", async (e) => {
                        const uid = e.target.dataset.id;
                        const snap = await db.ref("users/" + uid).get();
                        if (!snap.exists()) return;
                        const u = snap.val();

                        const emergency = e.target.dataset.emergency;
                        const description = e.target.dataset.description;
                        const location = e.target.dataset.location;
                        const imageUrl = e.target.dataset.image;

                        modalContent.innerHTML = `
                            <strong>Reporter Info</strong><br>
                            <strong>Name:</strong> ${u.name || "Unknown"}<br>
                            <strong>Email:</strong> ${u.email || "No email"}<br>
                            <strong>Contact:</strong> ${u.contact || "N/A"}<br>
                            <strong>Home Address:</strong> ${u.homeAddress || "N/A"}<br>
                            <strong>Present Address:</strong> ${u.presentAddress || "N/A"}<br><br>

                            <strong>Report Info</strong><br>
                            <strong>Emergency:</strong> ${emergency}<br>
                            <strong>Description:</strong> ${description}<br>
                            <strong>Location:</strong> ${location}<br>
                            ${imageUrl ? `<img src="${imageUrl}" alt="Report Image">` : ""}
                        `;
                        modal.style.display = "block";
                    });
                });

            } catch (e) {
                console.error("Error loading reports:", e);
            }
        });
    }
});
