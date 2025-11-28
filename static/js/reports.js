document.addEventListener("DOMContentLoaded", () => {
    const reportsTableBody = document.getElementById("reportsTableBody");

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
                const org = user.organization || "N/A";

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
                } else if (r.locationType === "Current Location" || r.locationType === "customLocation") {
                    displayLocation = r.location || "Unknown Location";
                }

                // STATUS
                const status = r.status || "Pending";

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
                        <td>${status}</td>
                    </tr>
                `;

                reportsTableBody.insertAdjacentHTML("beforeend", row);
            }
        } catch (e) {
            console.error("Error loading reports:", e);
        }
    }

    fetchReports();
});
