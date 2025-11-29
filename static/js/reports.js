document.addEventListener("DOMContentLoaded", () => {
    const reportsTableBody = document.getElementById("reportsTableBody");
    let currentUserRole = "user"; // default role

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
        fetchReports(); // fetch reports after getting role
    });

    // ---------------------------
    // Update Report Status
    // ---------------------------
    async function updateStatus(reportId, newStatus) {
        try {
            await db.ref("reports/" + reportId).update({ status: newStatus });
            fetchReports(); // refresh table
        } catch (err) {
            console.error("Error updating status:", err);
        }
    }

    // ---------------------------
    // Publicize Report
    // ---------------------------
    async function publicizeReport(reportId) {
        try {
            const reportSnap = await db.ref("reports/" + reportId).get();
            if (!reportSnap.exists()) return;

            const reportData = reportSnap.val();

            // Determine message: if emergency is "Others", use otherEmergency
            const message = (reportData.emergency === "Others" && reportData.otherEmergency && reportData.otherEmergency.trim() !== "")
                ? reportData.otherEmergency
                : reportData.emergency || "No message";

            // Determine location
            let location = "N/A";
            if (reportData.locationType === "HomeAddress") {
                location = reportData.homeAddress || "No Home Address";
            } else if (reportData.locationType === "PresentAddress") {
                location = reportData.presentAddress || "No Present Address";
            } else if (reportData.locationType === "Current Location" || reportData.locationType === "customLocation") {
                const loc = reportData.location || "Unknown Location";
                const match = loc.match(/Lat:\s*([-\d.]+),\s*Lng:\s*([-\d.]+)/);
                if (match) {
                    const lat = match[1];
                    const lng = match[2];
                    location = `${lat}, ${lng}`;
                } else {
                    location = loc;
                }
            }

            await db.ref("notifications").push({
                title: "A new emergency report has been publicized near you!",
                message: message,
                location: location,
                timestamp: Date.now(),
            });

            alert("Report publicized successfully!");
        } catch (err) {
            console.error("Error publicizing report:", err);
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
                    } else if (r.locationType === "Current Location" || r.locationType === "customLocation") {
                        let loc = r.location || "Unknown Location";
                        const match = loc.match(/Lat:\s*([-\d.]+),\s*Lng:\s*([-\d.]+)/);
                        if (match) {
                            const lat = match[1];
                            const lng = match[2];
                            displayLocation = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank">${lat}, ${lng}</a>`;
                        } else displayLocation = loc;
                    }

                    // ---------------------------
                    // STATUS & BUTTONS
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

                    // Append to table
                    const row = `
                        <tr>
                            <td>${name}</td>
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
                // BUTTON HANDLER
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

            } catch (e) {
                console.error("Error loading reports:", e);
            }
        });
    }
});
