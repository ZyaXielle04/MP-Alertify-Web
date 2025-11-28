document.addEventListener("DOMContentLoaded", () => {
    const reportsTableBody = document.getElementById("reportsTableBody");

    async function updateStatus(reportId, newStatus) {
        try {
            await db.ref("reports/" + reportId).update({ status: newStatus });
            fetchReports(); // refresh table
        } catch (err) {
            console.error("Error updating status:", err);
        }
    }

    function getStatusBadge(status) {
        const colors = {
            "pending": "#7f8c8d",      // gray
            "Rejected": "#e74c3c",     // red
            "Respond": "#f1c40f",      // yellow
            "onRoute": "#3498db",      // blue
            "Responded": "#2ecc71"     // green
        };

        return `<span class="badge" style="
            background:${colors[status] || '#7f8c8d'};
            padding:6px 10px;
            border-radius:6px;
            color:white;
            font-size:12px;
        ">${status}</span>`;
    }

    async function fetchReports() {
        try {
            const reportsSnap = await db.ref("reports").get();
            const usersSnap = await db.ref("users").get();

            if (!reportsSnap.exists()) {
                reportsTableBody.innerHTML = `
                    <tr><td colspan="8" style="text-align:center;">No reports found</td></tr>
                `;
                return;
            }

            const reports = reportsSnap.val();
            const users = usersSnap.exists() ? usersSnap.val() : {};

            reportsTableBody.innerHTML = ""; // clear table

            for (let id in reports) {
                const r = reports[id];
                const reporterId = r.reporter;
                const user = users[reporterId] || {};

                // Name + Contact
                const name = user.name || "Unknown User";
                const contact = user.contact || "N/A";

                // Emergency
                const emergency = r.emergency === "Others" ? r.otherEmergency : r.emergency;

                // Organization
                const org = r.organization || "N/A";

                // Description
                const description = r.additionalMessage || "No description";

                // Image
                const imageHtml = r.imageUrl
                    ? `<img src="${r.imageUrl}" alt="Attachment">`
                    : `<span>No Image</span>`;

                // LOCATION HANDLING
                let displayLocation = "N/A";

                if (r.locationType === "HomeAddress") {
                    displayLocation = user.homeAddress || "No Home Address";
                } else if (r.locationType === "PresentAddress") {
                    displayLocation = user.presentAddress || "No Present Address";
                } else if (
                    r.locationType === "Current Location" ||
                    r.locationType === "customLocation"
                ) {
                    displayLocation = r.location || "Unknown Location";
                }

                // STATUS (logic below)
                let statusHtml = "";

                switch (r.status) {
                    case "pending":
                        statusHtml = `
                            ${getStatusBadge("pending")}
                            <br>
                            <button class="btn gray" data-action="reject" data-id="${id}">Reject</button>
                            <button class="btn yellow" data-action="respond" data-id="${id}">Respond</button>
                        `;
                        break;

                    case "Rejected":
                        statusHtml = `${getStatusBadge("Rejected")}`;
                        break;

                    case "Respond":
                        statusHtml = `
                            ${getStatusBadge("Respond")}
                            <br>
                            <button class="btn blue" data-action="onroute" data-id="${id}">On Route</button>
                        `;
                        break;

                    case "onRoute":
                        statusHtml = `
                            ${getStatusBadge("onRoute")}
                            <br>
                            <button class="btn green" data-action="responded" data-id="${id}">Responded</button>
                        `;
                        break;

                    case "Responded":
                        statusHtml = `${getStatusBadge("Responded")}`;
                        break;

                    default:
                        statusHtml = `${getStatusBadge("pending")}`;
                }

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

            // BUTTON ACTION HANDLER
            document.querySelectorAll(".btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const reportId = btn.dataset.id;
                    const action = btn.dataset.action;

                    if (action === "reject") updateStatus(reportId, "Rejected");
                    if (action === "respond") updateStatus(reportId, "Respond");
                    if (action === "onroute") updateStatus(reportId, "onRoute");
                    if (action === "responded") updateStatus(reportId, "Responded");
                });
            });

        } catch (e) {
            console.error("Error loading reports:", e);
        }
    }

    fetchReports();
});
