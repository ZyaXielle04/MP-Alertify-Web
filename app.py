from flask import Flask, request, jsonify, render_template
import firebase_admin
from firebase_admin import credentials, auth, db
import requests
import os
import json

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

        # Create notification text
        title = "MP Alertify - New Report"
        body = f"Report from {report.get('reporter', 'Unknown')} has been publicized."

        # Fetch all user tokens
        users = db.reference("users").get()
        tokens = []
        for uid, info in users.items():
            if "fcmToken" in info:
                tokens.append(info["fcmToken"])

        # Send notifications
        for token in tokens:
            send_fcm_notification(token, title, body)

        return jsonify({"success": True, "message": "Report publicized & notifications sent"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ---------------------------------------------------------
# SEND FCM NOTIFICATION (NO CLOUD FUNCTIONS NEEDED)
# ---------------------------------------------------------
def send_fcm_notification(token, title, body):
    headers = {
        "Authorization": f"key={FCM_SERVER_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "to": token,
        "notification": {
            "title": title,
            "body": body,
            "sound": "default"
        }
    }

    response = requests.post(FCM_URL, headers=headers, json=payload)
    return response.json()


# ---------------------------
# DISABLE / ENABLE USER
# ---------------------------
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
