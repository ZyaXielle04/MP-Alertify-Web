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
            max-height: 70vh;
            background: white;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            display: none;
            padding: 20px;
            overflow-y: auto;
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

        /* Reject confirmation popup */
        #rejectConfirmPopup {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 420px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 6px 28px rgba(0,0,0,0.35);
            z-index: 20000;
            display: none;
            padding: 16px;
        }
        #rejectConfirmPopup h4 { margin: 0 0 8px 0; }
        #rejectConfirmPopup textarea {
            width: 100%;
            min-height: 80px;
            margin-bottom: 10px;
            padding: 8px;
            border-radius: 6px;
            border: 1px solid #ccc;
            resize: vertical;
        }
        #rejectConfirmPopup .btn-row { display:flex; gap:8px; justify-content:flex-end; }
        #rejectConfirmPopup .btn { padding:8px 12px; border-radius:6px; border:none; cursor:pointer; }
        #rejectCancelBtn { background: #e74c3c; color:white; }
        #rejectBtn { background: #9b59b6; color:white; }
        #rejectWarnBtn { background: #f39c12; color:white; }
        #rejectReasonLabel { font-size: 13px; color:#333; margin-bottom:6px; display:block; }
    `;
    document.head.appendChild(imgStyle);

    // --------------------------------------------------------
    // Modal container (reporter details)
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

    // --------------------------------------------------------
    // Reject Confirmation Popup (created once)
    // --------------------------------------------------------
    const rejectPopup = document.createElement("div");
    rejectPopup.id = "rejectConfirmPopup";
    rejectPopup.innerHTML = `
        <h4>Reject Report?</h4>
        <label id="rejectReasonLabel">Reason (optional):</label>
        <textarea id="rejectReasonInput" placeholder="Provide a reason (optional)"></textarea>
        <div class="btn-row">
            <button id="rejectCancelBtn" class="btn">Cancel</button>
            <button id="rejectBtn" class="btn">Reject</button>
            <button id="rejectWarnBtn" class="btn">Reject & Warn</button>
        </div>
    `;
    document.body.appendChild(rejectPopup);

    const rejectReasonInput = document.getElementById("rejectReasonInput");
    const rejectCancelBtn = document.getElementById("rejectCancelBtn");
    const rejectBtn = document.getElementById("rejectBtn");
    const rejectWarnBtn = document.getElementById("rejectWarnBtn");

    // Current reportId being acted on (set when opening popup)
    let currentRejectReportId = null;

    // Close handler
    rejectCancelBtn.addEventListener("click", () => {
        rejectReasonInput.value = "";
        currentRejectReportId = null;
        rejectPopup.style.display = "none";
    });

    // ---------------------------
    // Helper: Get address from lat/lng via OpenStreetMap Nominatim
    // ---------------------------
    async function getAddressFromCoords(lat, lng) {
        if (!lat || !lng) return "N/A";
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
        try {
            const response = await fetch(url, { headers: { "User-Agent": "MP-Alertify-App" } });
            const data = await response.json();
            return data.display_name || `${lat}, ${lng}`;
        } catch (err) {
            console.error("Nominatim error:", err);
            return `${lat}, ${lng}`;
        }
    }

    // ---------------------------
    // Get current user role
    // ---------------------------
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            const uidSnap = await db.ref("users/" + user.uid + "/role").get();
            if (uidSnap.exists()) currentUserRole = uidSnap.val();
        }
        fetchReports();
    });

    // ---------------------------
    // Update Report Status (now supports options: reason, warn, saveReason)
    // ---------------------------
    async function updateStatus(reportId, newStatus, options = {}) {
        const customMessage = options.customMessage ? String(options.customMessage).trim() : null;
        const reason = options.reason ? String(options.reason).trim() : null;
        const warn = !!options.warn;
        const saveReason = options.saveReason === undefined ? true : !!options.saveReason;

        try {
            await db.ref("reports/" + reportId).update({ status: newStatus });

            // Save reject reason if applicable
            if (newStatus === "Rejected" && reason && saveReason) {
                await db.ref(`reports/${reportId}/rejectReason`).set(reason);
            }

            const reportSnap = await db.ref("reports/" + reportId).get();
            if (!reportSnap.exists()) return;
            const reporterId = reportSnap.val().reporter;

            const userSnap = await db.ref(`users/${reporterId}`).get();
            if (!userSnap.exists()) return;
            const fcmToken = userSnap.val().fcmToken;

            // Increment warnCount if needed
            if (warn && reporterId) {
                await db.ref(`users/${reporterId}/warnCount`).transaction(current => (current || 0) + 1);
            }

            // Determine default message
            let title = "";
            let body = "";
            let iconType = "";

            switch (newStatus) {
                case "Rejected":
                    title = "Report Rejected";
                    body = "Your report has been rejected by the admin.";
                    if (reason) body += ` Reason: ${reason}`;
                    iconType = "error";
                    break;
                case "Respond":
                    title = "Report Verified - On Route";
                    body = "Your report is verified and help is on the way.";
                    iconType = "success";
                    break;
                case "onRoute":
                    title = "On Route";
                    body = "Responders are on route to your location.";
                    iconType = "info";
                    break;
                case "Responded":
                    title = "Responded";
                    body = "Your report has been addressed.";
                    iconType = "success";
                    break;
                default:
                    title = "Report Update";
                    body = `Your report status changed to ${newStatus}.`;
            }

            // Append admin's custom message if any
            if (customMessage) body += `\nMessage from Admin: ${customMessage}`;

            // Send notification
            if (fcmToken) {
                await fetch("/send_status_notification", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        token: fcmToken,
                        title,
                        body,
                        data: { reportId, status: newStatus, iconType }
                    })
                });
            }

        } catch (err) {
            console.error("Error updating status:", err);
        }
    }

    // ---------------------------
    // Publicize Report (No SMS)
    // ---------------------------
    async function publicizeReport(reportId) {
        if (!reportId) return;
        try {
            const reportSnap = await db.ref("reports/" + reportId).get();
            if (!reportSnap.exists()) return alert("Report not found");

            // Call your backend endpoint to publicize report
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
                    reportsTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;">No reports found</td></tr>`;
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
                    const description = r.additionalMessage || "No description";
                    const imageUrl = r.imageUrl || "";

                    const reportTimestamp = r.timestamp
                        ? new Date(r.timestamp).toLocaleString()
                        : "N/A";

                    // LOCATION
                    let locationText = "N/A";
                    let lat = "";
                    let lng = "";
                    if (r.locationType === "Home Address") {
                        locationText = user.homeAddress || "No Home Address";
                    } else if (r.locationType === "Present Address") {
                        locationText = user.presentAddress || "No Present Address";
                    } else {
                        let loc = r.location || "Unknown Location";
                        const match = loc.match(/Lat:\s*([-\d.]+),\s*Lng:\s*([-\d.]+)/);
                        if (match) {
                            lat = match[1];
                            lng = match[2];
                            locationText = await getAddressFromCoords(lat, lng);
                        } else {
                            locationText = loc;
                        }
                    }

                    // STATUS BUTTONS
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
                        <div style="font-size:12px; color:#555; margin-bottom:6px;">
                            <strong>Reported:</strong><br>
                            ${reportTimestamp}
                        </div>

                        ${getStatusBadge(r.status)}<br>

                        ${statusButtons}<br>
                        ${publicizeHtml}
                    `;

                    const imageHtml = imageUrl ? `<img src="${imageUrl}" alt="Attachment">` : `<span>No Image</span>`;
                    const row = `
                        <tr>
                            <td>
                                <span class="reporter-name"
                                      data-id="${reporterId}"
                                      data-timestamp="${reportTimestamp}"
                                      data-emergency="${emergency}"
                                      data-description="${description}"
                                      data-location-text="${locationText}"
                                      data-lat="${lat}"
                                      data-lng="${lng}"
                                      data-image="${imageUrl}"
                                      style="cursor:pointer; color:#3498db; text-decoration:underline;">
                                    ${name}
                                </span>
                            </td>
                            <td>${emergency}</td>
                            <td>${description}</td>
                            <td>${imageHtml}</td>
                            <td>${contact}</td>
                            <td>${lat && lng ? `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank">${locationText}</a>` : locationText}</td>
                            <td>${statusHtml}</td>
                        </tr>
                    `;
                    reportsTableBody.insertAdjacentHTML("afterbegin", row);
                }

                // STATUS BUTTON HANDLER
                document.querySelectorAll(".btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        const reportId = btn.dataset.id;
                        const action = btn.dataset.action;

                        if (action === "reject") {
                            // open reject confirmation modal
                            openRejectModal(reportId);
                            return;
                        }
                        if (action === "respond" || action === "onroute" || action === "responded") {
                            // Ask admin for an optional message
                            const customMessage = prompt("Add a custom message for the user (optional):", "");
                            updateStatus(reportId, 
                                        action === "respond" ? "Respond" : action === "onroute" ? "onRoute" : "Responded", 
                                        { customMessage });
                        }
                        if (action === "publicize") publicizeReport(reportId);
                    });
                });

                // MODAL DISPLAY
                document.querySelectorAll(".reporter-name").forEach(span => {
                    span.addEventListener("click", async (e) => {
                        const uid = e.target.dataset.id;
                        const snap = await db.ref("users/" + uid).get();
                        if (!snap.exists()) return;
                        const u = snap.val();

                        // Fetch emergency contacts
                        const contactsSnap = await db.ref(`users/${uid}/emergencyContacts`).get();
                        let contactsHtml = "<em>No emergency contacts</em>";
                        if (contactsSnap.exists()) {
                            const contacts = contactsSnap.val();
                            contactsHtml = "<ul>";
                            for (const cid in contacts) {
                                contactsHtml += `<li>${contacts[cid].name} — ${contacts[cid].number}</li>`;
                            }
                            contactsHtml += "</ul>";
                        }

                        const emergency = e.target.dataset.emergency;
                        const description = e.target.dataset.description;
                        const locationText = e.target.dataset.locationText;
                        const lat = e.target.dataset.lat;
                        const lng = e.target.dataset.lng;
                        const imageUrl = e.target.dataset.image;
                        const reportTimestamp = e.target.dataset.timestamp || "N/A";

                        let locationHtml = locationText;
                        if (lat && lng) {
                            locationHtml = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank">${locationText}</a>`;
                        }

                        // Populate modal
                        modalContent.innerHTML = `
                            <strong>Reporter Info</strong><br>
                            <strong>Name:</strong> ${u.name || "Unknown"}<br>
                            <strong>Email:</strong> ${u.email || "No email"}<br>
                            <strong>Contact:</strong> ${u.contact || "N/A"}<br>
                            <strong>Home Address:</strong> ${u.homeAddress || "N/A"}<br>
                            <strong>Present Address:</strong> ${u.presentAddress || "N/A"}<br><br>

                            <strong>Emergency Contacts</strong><br>
                            ${contactsHtml}<br>

                            <strong>Report Info</strong><br>
                            <strong>Emergency:</strong> ${emergency}<br>
                            <strong>Description:</strong> ${description}<br>
                            <strong>Location:</strong> ${locationHtml}<br>
                            <strong>Reported At:</strong> ${reportTimestamp}<br>
                            ${imageUrl ? `<img src="${imageUrl}" alt="Report Image" style="max-width:200px;">` : ""}<br><br>

                            <button id="exportPdfBtn" class="btn blue">Export Report as PDF</button>
                        `;

                        modal.style.display = "block";

                        // Attach export PDF handler INSIDE modal population
                        document.getElementById("exportPdfBtn").addEventListener("click", async () => {
                            const { jsPDF } = window.jspdf;
                            const doc = new jsPDF();
                            let y = 10;
                            const exportTimestamp = new Date().toLocaleString();

                            doc.setFontSize(14);
                            doc.text("Reporter & Report Details", 10, y); y += 10;

                            doc.setFontSize(12);
                            doc.text(`Name: ${u.name || "Unknown"}`, 10, y); y += 7;
                            doc.text(`Email: ${u.email || "No email"}`, 10, y); y += 7;
                            doc.text(`Contact: ${u.contact || "N/A"}`, 10, y); y += 7;
                            doc.text(`Home Address: ${u.homeAddress || "N/A"}`, 10, y); y += 7;
                            doc.text(`Present Address: ${u.presentAddress || "N/A"}`, 10, y); y += 10;

                            doc.text("Emergency Contacts:", 10, y); y += 7;
                            if (contactsSnap.exists()) {
                                for (const cid in contactsSnap.val()) {
                                    const c = contactsSnap.val()[cid];
                                    doc.text(`- ${c.name} — ${c.number}`, 10, y); y += 7;
                                }
                            } else {
                                doc.text("No emergency contacts", 10, y); y += 7;
                            }
                            y += 5;

                            doc.text("Report Info:", 10, y); y += 7;
                            doc.text(`Emergency: ${emergency}`, 10, y); y += 7;
                            doc.text(`Description: ${description}`, 10, y); y += 7;
                            doc.text(`Location: ${locationText}`, 10, y); y += 7;
                            doc.text(`Report Timestamp: ${reportTimestamp}`, 10, y); y += 7;
                            doc.text(`Export Timestamp: ${exportTimestamp}`, 10, y); y += 10;

                            // Add image if available
                            if (imageUrl) {
                                const img = new Image();
                                img.crossOrigin = "anonymous";
                                img.src = imageUrl;
                                img.onload = function () {
                                    const width = 180;
                                    const height = (img.height * width) / img.width;
                                    doc.addImage(img, "JPEG", 15, y, width, height);
                                    doc.save(`report_${u.name}_${Date.now()}.pdf`);
                                };
                            } else {
                                doc.save(`report_${u.name}_${Date.now()}.pdf`);
                            }
                        });
                    });
                });

            } catch (e) {
                console.error("Error loading reports:", e);
            }
        });
    }

    // ---------------------------
    // Open Reject Modal
    // ---------------------------
    function openRejectModal(reportId) {
        currentRejectReportId = reportId;
        rejectReasonInput.value = "";

        // show popup
        rejectPopup.style.display = "block";

        // Attach click handlers (we attach fresh handlers to avoid duplicate listeners)
        const onReject = async () => {
            const reason = rejectReasonInput.value.trim();
            // Just reject
            await updateStatus(currentRejectReportId, "Rejected", { reason: reason || null, warn: false, saveReason: true });
            cleanupRejectHandlers();
            rejectPopup.style.display = "none";
            currentRejectReportId = null;
        };

        const onRejectWarn = async () => {
            const reason = rejectReasonInput.value.trim();
            // Reject and warn
            await updateStatus(currentRejectReportId, "Rejected", { reason: reason || null, warn: true, saveReason: true });
            cleanupRejectHandlers();
            rejectPopup.style.display = "none";
            currentRejectReportId = null;
        };

        function cleanupRejectHandlers() {
            rejectBtn.removeEventListener("click", onReject);
            rejectWarnBtn.removeEventListener("click", onRejectWarn);
            rejectCancelBtn.removeEventListener("click", onCancel);
        }

        const onCancel = () => {
            cleanupRejectHandlers();
            rejectPopup.style.display = "none";
            currentRejectReportId = null;
        };

        // Make sure we don't double-bind
        rejectBtn.addEventListener("click", onReject);
        rejectWarnBtn.addEventListener("click", onRejectWarn);
        rejectCancelBtn.addEventListener("click", onCancel);
    }

});
