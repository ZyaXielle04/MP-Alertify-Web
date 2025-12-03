document.addEventListener("DOMContentLoaded", () => {
    const reportsTableBody = document.getElementById("reportsTableBody");
    let currentUserRole = "user"; // default role

    // --------------------------------------------------------
    // Inject CSS for image hover zoom (scale 2.5)
    // --------------------------------------------------------
    const imgStyle = document.createElement("style");
    imgStyle.innerHTML = `
        #reportsTableBody img {
            width: 60px;
            height: 60px;
            object-fit: cover;
            border-radius: 6px;
            transition: transform 0.25s ease-in-out;
        }

        #reportsTableBody img:hover {
            transform: scale(2.5);
            z-index: 9999;
            position: relative;
        }
    `;
    document.head.appendChild(imgStyle);

    // --------------------------------------------------------
    // Tooltip container for reporter hover
    // --------------------------------------------------------
    const tooltip = document.createElement("div");
    tooltip.id = "reporterTooltip";
    tooltip.style.position = "fixed";
    tooltip.style.padding = "10px";
    tooltip.style.background = "white";
    tooltip.style.border = "1px solid #ccc";
    tooltip.style.borderRadius = "8px";
    tooltip.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
    tooltip.style.display = "none";
    tooltip.style.zIndex = "9999";
    tooltip.style.transition = "opacity 0.15s ease-in-out";
    tooltip.style.opacity = "0";
    tooltip.style.pointerEvents = "none";
    document.body.appendChild(tooltip);

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
                // HOVER TOOLTIP (Reporter Info)
                // ---------------------------
                document.querySelectorAll(".reporter-name").forEach(span => {
                    span.addEventListener("mouseenter", async (e) => {
                        const uid = e.target.dataset.id;

                        const snap = await db.ref("users/" + uid).get();
                        if (!snap.exists()) return;

                        const u = snap.val();

                        tooltip.innerHTML = `
                            <strong>${u.name || "Unknown"}</strong><br>
                            <small>${u.email || "No email"}</small><br><br>
                            <strong>Contact:</strong> ${u.contact || "N/A"}<br>
                            <strong>Home Address:</strong> ${u.homeAddress || "N/A"}<br>
                            <strong>Present Address:</strong> ${u.presentAddress || "N/A"}
                        `;

                        tooltip.style.display = "block";
                        tooltip.style.opacity = "1";
                    });

                    span.addEventListener("mousemove", (e) => {
                        tooltip.style.left = (e.pageX + 15) + "px";
                        tooltip.style.top = (e.pageY + 15) + "px";
                    });

                    span.addEventListener("mouseleave", () => {
                        tooltip.style.opacity = "0";
                        setTimeout(() => {
                            tooltip.style.display = "none";
                        }, 150);
                    });
                });

            } catch (e) {
                console.error("Error loading reports:", e);
            }
        });
    }
});
