from flask import Flask, request, jsonify, render_template
import firebase_admin
from firebase_admin import credentials, auth, db
import requests
import os
import json
import re

# ---------------------------
# Flask app
# ---------------------------
app = Flask(
    __name__,
    template_folder="templates",
    static_folder="static"
)

# ---------------------------
# Initialize Firebase Admin
# ---------------------------
cred_json = os.environ.get("FIREBASE_ADMIN_JSON")
cred = credentials.Certificate(json.loads(cred_json))

firebase_admin.initialize_app(cred, {
    "databaseURL": "https://mp-alertify-default-rtdb.asia-southeast1.firebasedatabase.app/"
})

# ---------------------------
# FCM CONFIG
# ---------------------------
FCM_SERVER_KEY = os.environ.get("FCM_SERVER_KEY")
FCM_URL = "https://fcm.googleapis.com/fcm/send"

# ---------------------------
# ROOT ROUTE - Landing Page
# ---------------------------
@app.route("/")
def home():
    return render_template("index.html")

# ---------------------------
# ADMIN PAGES
# ---------------------------
@app.route("/admin/dashboard")
def admin_dashboard():
    return render_template("admin/dashboard.html")

@app.route("/admin/users")
def manage_users():
    return render_template("admin/users.html")

@app.route("/admin/reports")
def view_reports():
    return render_template("admin/reports.html")

# ---------------------------------------------------------
# STORE FCM TOKEN (CALLED BY ANDROID APP ON LOGIN)
# ---------------------------------------------------------
@app.route("/register_fcm_token", methods=["POST"])
def register_fcm_token():
    data = request.json
    uid = data.get("uid")
    token = data.get("token")

    if not uid or not token:
        return jsonify({"success": False, "error": "Missing uid or token"}), 400

    try:
        db.reference(f"users/{uid}/fcmToken").set(token)
        return jsonify({"success": True, "message": "Token saved"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ---------------------------------------------------------
# PUBLICIZE A REPORT (ADMIN TRIGGER)
# ---------------------------------------------------------
@app.route("/publicize_report", methods=["POST"])
def publicize_report():
    data = request.json
    report_id = data.get("reportId")

    if not report_id:
        return jsonify({"success": False, "error": "Missing reportId"}), 400

    try:
        # Mark report as publicized
        db.reference(f"reports/{report_id}/publicized").set(True)

        # Load report
        report = db.reference(f"reports/{report_id}").get()
        if not report:
            return jsonify({"success": False, "error": "Report not found"}), 404

        # Determine message: use emergency if exists, otherwise use otherEmergency
        message = report.get("emergency") or report.get("otherEmergency") or "No message"

        # Determine location
        location = "N/A"
        loc_type = report.get("locationType")
        if loc_type in ["HomeAddress", "PresentAddress"]:
            location = report.get("location") or "N/A"
        elif loc_type in ["Current Location", "customLocation"]:
            loc = report.get("location", "Unknown Location")
            match = re.match(r"Lat:\s*([-\d.]+),\s*Lng:\s*([-\d.]+)", loc)
            if match:
                lat, lng = match.groups()
                location = f"{lat}, {lng}"
            else:
                location = loc

        title = "MP Alertify - New Emergency Report"

        # Fetch all user tokens
        users = db.reference("users").get()
        tokens = [info.get("fcmToken") for uid, info in users.items() if info.get("fcmToken")]

        # Send notifications
        for token in tokens:
            payload = {
                "to": token,
                "notification": {   # ensures tray notification even if app is closed
                    "title": title,
                    "body": message,
                    "sound": "default"
                },
                "data": {   # optional, extra info for app when user taps notification
                    "reportId": report_id,
                    "location": location,
                    "timestamp": str(report.get("timestamp", ""))
                }
            }

            headers = {
                "Authorization": f"key={FCM_SERVER_KEY}",
                "Content-Type": "application/json"
            }

            requests.post(FCM_URL, headers=headers, json=payload)

        return jsonify({"success": True, "message": "Report publicized & notifications sent"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ---------------------------------------------------------
# DISABLE / ENABLE USER
# ---------------------------------------------------------
@app.route("/disable_user", methods=["POST"])
def disable_user():
    data = request.json
    uid = data.get("uid")
    disable = data.get("disable")

    if not uid or disable is None:
        return jsonify({"success": False, "error": "Missing uid or disable field"}), 400

    try:
        auth.update_user(uid, disabled=disable)
        db.reference(f"users/{uid}/disabled").set(disable)

        status = "disabled" if disable else "enabled"
        return jsonify({"success": True, "message": f"User {uid} has been {status}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ---------------------------
# Run server
# ---------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
