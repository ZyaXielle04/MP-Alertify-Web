from flask import Flask, request, jsonify, render_template
import firebase_admin
from firebase_admin import credentials, auth, db
from google.oauth2 import service_account
import google.auth.transport.requests
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

service_account_info = json.loads(cred_json)
PROJECT_ID = service_account_info["project_id"]

# ======================================================
# FCM HTTP v1 TOKEN CREATION
# ======================================================
def get_access_token():
    credentials_obj = service_account.Credentials.from_service_account_info(
        service_account_info,
        scopes=["https://www.googleapis.com/auth/firebase.messaging"],
    )
    request_obj = google.auth.transport.requests.Request()
    credentials_obj.refresh(request_obj)
    return credentials_obj.token


# ======================================================
# SEND PUSH NOTIFICATION (HTTP v1)
# ======================================================
def send_fcm_v1(token, title, body, data_payload):
    access_token = get_access_token()

    url = f"https://fcm.googleapis.com/v1/projects/mp-alertify/messages:send"

    message = {
        "message": {
            "token": token,
            "notification": {
                "title": title,
                "body": body
            },
            "data": data_payload
        }
    }

    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; UTF-8",
    }

    response = requests.post(url, headers=headers, json=message)
    print("FCM v1 Response:", response.text)
    return response


# ---------------------------
# ROOT ROUTE
# ---------------------------
@app.route("/")
def home():
    return render_template("index.html")

# ---------------------------
# Admin pages
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
# STORE FCM TOKEN
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
        # Mark report publicized
        db.reference(f"reports/{report_id}/publicized").set(True)

        # Load report
        report = db.reference(f"reports/{report_id}").get()
        if not report:
            return jsonify({"success": False, "error": "Report not found"}), 404

        message = report.get("emergency") or report.get("otherEmergency") or "New report"
        title = "MP Alertify - Emergency Report"

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

        # Load all user tokens
        users = db.reference("users").get()
        tokens = [info.get("fcmToken") for uid, info in users.items() if info.get("fcmToken")]

        # Send notifications
        for token in tokens:
            data_payload = {
                "reportId": report_id,
                "location": location,
                "timestamp": str(report.get("timestamp", "")),
            }

            send_fcm_v1(
                token=token,
                title=title,
                body=message,
                data_payload=data_payload
            )

        return jsonify({"success": True, "message": "Report publicized & notifications sent"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ---------------------------------------------------------
# DISABLE USER
# ---------------------------------------------------------
@app.route("/disable_user", methods=["POST"])
def disable_user():
    data = request.json
    uid = data.get("uid")
    disable = data.get("disable")

    if not uid or disable is None:
        return jsonify({"success": False, "error": "Missing uid or disable"}), 400

    try:
        auth.update_user(uid, disabled=disable)
        db.reference(f"users/{uid}/disabled").set(disable)
        return jsonify({"success": True, "message": f"User {uid} updated"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ---------------------------
# Run server
# ---------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
