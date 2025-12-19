// =====================================================
// MP-Alertify – Reports Filters Logic
// File: reports.filters.js
// Depends on: reports.js (must be loaded first)
// =====================================================

document.addEventListener("DOMContentLoaded", () => {

    // -----------------------------
    // FILTER ELEMENTS
    // -----------------------------
    const dateFilter = document.getElementById("dateFilter");
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const emergencyFilter = document.getElementById("emergencyFilter");
    const exportFilteredBtn = document.getElementById("exportFilteredPdf");

    // -----------------------------
    // INTERNAL STORAGE
    // -----------------------------
    let allReportsCache = {};   // raw Firebase data
    let filteredReportIds = []; // IDs currently shown

    // -----------------------------
    // LISTEN TO REPORTS ONCE
    // (Reuse same DB path as reports.js)
    // -----------------------------
    firebase.database().ref("reports").on("value", snapshot => {
        allReportsCache = snapshot.val() || {};
        applyFilters();
    });

    // -----------------------------
    // FILTER EVENTS
    // -----------------------------
    dateFilter.addEventListener("change", () => {
        toggleCustomDateInputs();
        applyFilters();
    });

    startDateInput.addEventListener("change", applyFilters);
    endDateInput.addEventListener("change", applyFilters);
    emergencyFilter.addEventListener("change", applyFilters);

    // -----------------------------
    // ENABLE / DISABLE CUSTOM RANGE
    // -----------------------------
    function toggleCustomDateInputs() {
        const isCustom = dateFilter.value === "custom";
        startDateInput.disabled = !isCustom;
        endDateInput.disabled = !isCustom;

        if (!isCustom) {
            startDateInput.value = "";
            endDateInput.value = "";
        }
    }

    // -----------------------------
    // APPLY FILTERS
    // -----------------------------
    function applyFilters() {
        const now = new Date();
        filteredReportIds = [];

        Object.entries(allReportsCache).forEach(([reportId, report]) => {

            // -------------------------
            // TIMESTAMP CHECK
            // -------------------------
            if (!report.timestamp) return;

            const reportDate = new Date(report.timestamp);

            // -------------------------
            // DATE FILTER
            // -------------------------
            if (!passesDateFilter(reportDate, now)) return;

            // -------------------------
            // EMERGENCY FILTER
            // -------------------------
            if (
                emergencyFilter.value !== "all" &&
                report.emergency !== emergencyFilter.value
            ) return;

            filteredReportIds.push(reportId);
        });

        renderFilteredReports();
    }

    // -----------------------------
    // DATE FILTER LOGIC
    // -----------------------------
    function passesDateFilter(reportDate, now) {
        const filter = dateFilter.value;

        if (filter === "all") return true;

        if (filter === "daily") {
            return isSameDay(reportDate, now);
        }

        if (filter === "weekly") {
            return isSameWeek(reportDate, now);
        }

        if (filter === "monthly") {
            return (
                reportDate.getMonth() === now.getMonth() &&
                reportDate.getFullYear() === now.getFullYear()
            );
        }

        if (filter === "yearly") {
            return reportDate.getFullYear() === now.getFullYear();
        }

        if (filter === "custom") {
            if (!startDateInput.value || !endDateInput.value) return true;

            const start = new Date(startDateInput.value);
            const end = new Date(endDateInput.value);
            end.setHours(23, 59, 59, 999);

            return reportDate >= start && reportDate <= end;
        }

        return true;
    }

    // -----------------------------
    // DATE HELPERS
    // -----------------------------
    function isSameDay(a, b) {
        return (
            a.getDate() === b.getDate() &&
            a.getMonth() === b.getMonth() &&
            a.getFullYear() === b.getFullYear()
        );
    }

    function isSameWeek(date, now) {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        return date >= startOfWeek && date <= endOfWeek;
    }

    // -----------------------------
    // RE-RENDER TABLE
    // -----------------------------
    function renderFilteredReports() {
        const tbody = document.getElementById("reportsTableBody");
        tbody.innerHTML = "";

        filteredReportIds
            .sort((a, b) => {
                return allReportsCache[b].timestamp - allReportsCache[a].timestamp;
            })
            .forEach(reportId => {

                // 🔁 Let reports.js handle actual row rendering
                if (typeof window.renderSingleReport === "function") {
                    window.renderSingleReport(reportId, allReportsCache[reportId]);
                }
            });
    }

    // -----------------------------
    // EXPORT FILTERED PDF
    // -----------------------------
    exportFilteredBtn.addEventListener("click", () => {
        if (!filteredReportIds.length) {
            alert("No reports to export for the selected filters.");
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        let y = 10;
        doc.setFontSize(14);
        doc.text("MP-Alertify – Filtered Reports", 10, y);
        y += 10;

        filteredReportIds.forEach((id, index) => {
            const r = allReportsCache[id];

            doc.setFontSize(11);
            doc.text(`Report #${index + 1}`, 10, y); y += 6;
            doc.text(`Emergency: ${r.emergency}`, 10, y); y += 6;
            doc.text(`Description: ${r.description || "N/A"}`, 10, y); y += 6;
            doc.text(
                `Reported At: ${new Date(r.timestamp).toLocaleString()}`,
                10,
                y
            );
            y += 10;

            if (y > 270) {
                doc.addPage();
                y = 10;
            }
        });

        doc.save("filtered-reports.pdf");
    });

});
