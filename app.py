from flask import Flask, request, jsonify, render_template
import firebase_admin
from firebase_admin import credentials, auth, db
from google.oauth2 import service_account
import google.auth.transport.requests
import requests
import os
import json
import re
from datetime import datetime

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
def send_fcm_v1(token, title, body, data_payload={}):
    access_token = get_access_token()

    url = f"https://fcm.googleapis.com/v1/projects/{PROJECT_ID}/messages:send"

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
        "Content-Type": "application/json"
    }

    response = requests.post(url, headers=headers, json=message)
    print("FCM HTTP v1 Response:", response.text)
    return response


# ======================================================
# SEND SMS VIA TEXTBELT
# ======================================================
def send_sms(number, message):
    try:
        resp = requests.post('https://textbelt.com/text', {
            'phone': number,
            'message': message,
            'key': 'textbelt'  # free key
        })
        print("TextBelt response:", resp.json())
        return resp.json()
    except Exception as e:
        print("TextBelt error:", e)
        return None


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
# PUBLICIZE REPORT (Send Notifications + SMS)
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

        # -----------------------------
        # Determine notification message
        # -----------------------------
        emergency = report.get("emergency", "")
        other = report.get("otherEmergency", "")

        if emergency == "Others":
            main_message = other if other else "Emergency Report"
        else:
            main_message = emergency if emergency else "Emergency Report"

        # -----------------------------
        # Determine location
        # -----------------------------
        location = "N/A"
        loc_type = report.get("locationType")
        raw_loc = report.get("location", "")

        if loc_type in ["HomeAddress", "PresentAddress"]:
            location = raw_loc or "N/A"
        elif loc_type in ["Current Location", "customLocation"]:
            match = re.match(r"Lat:\s*([-\d.]+),\s*Lng:\s*([-\d.]+)", raw_loc)
            if match:
                lat, lng = match.groups()
                location = f"{lat}, {lng}"
            else:
                location = raw_loc or "Unknown Location"

        # -----------------------------
        # Format timestamp
        # -----------------------------
        ts = report.get("timestamp")
        if ts:
            timestamp_str = datetime.fromtimestamp(int(ts)/1000).strftime("%Y-%m-%d %H:%M:%S")
        else:
            timestamp_str = "Unknown"

        # -----------------------------
        # Notification body
        # -----------------------------
        body_message = f"{main_message}\nLocation: {location}\nReported: {timestamp_str}"
        title = "MP Alertify - Emergency Report"

        # -----------------------------
        # Send push notifications (FCM)
        # -----------------------------
        users = db.reference("users").get()
        tokens = [info.get("fcmToken") for uid, info in users.items() if info.get("fcmToken")]

        for token in tokens:
            payload = {
                "reportId": report_id,
                "emergencyType": emergency,
                "location": location,
                "timestamp": timestamp_str
            }

            response = send_fcm_v1(
                token=token,
                title=title,
                body=body_message,
                data_payload=payload
            )
            if response.status_code != 200:
                print("FCM v1 Error:", response.text)

        # -----------------------------
        # Notify emergency contacts via SMS
        # -----------------------------
        reporter_id = report.get("reporter")
        if reporter_id:
            contacts_snap = db.reference(f"users/{reporter_id}/emergencyContacts").get()
            if contacts_snap:
                contacts = contacts_snap
                for cid, contact_info in contacts.items():
                    number = contact_info.get("number")
                    if number:
                        sms_message = f"Emergency Alert: {main_message}\nLocation: {location}\nReported: {timestamp_str}"
                        send_sms(number, sms_message)

        return jsonify({"success": True, "message": "Report publicized & notifications sent"})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ---------------------------------------------------------
# SEND REPORT STATUS NOTIFICATION TO USER
# ---------------------------------------------------------
@app.route("/send_status_notification", methods=["POST"])
def send_status_notification():
    """
    Expects JSON payload:
    {
        "token": "<user_fcm_token>",
        "title": "<notification title>",
        "body": "<notification body>",
        "data": { "reportId": "<id>", "status": "<status>", "iconType": "<success/error/info>" }
    }
    """
    data = request.json
    token = data.get("token")
    title = data.get("title")
    body = data.get("body")
    payload = data.get("data", {})

    if not token or not title or not body:
        return jsonify({"success": False, "error": "Missing required fields"}), 400

    try:
        response = send_fcm_v1(token=token, title=title, body=body, data_payload=payload)
        if response.status_code == 200:
            return jsonify({"success": True, "message": "Notification sent"})
        else:
            return jsonify({"success": False, "error": response.text}), 500
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


# ---------------------------------------------------------
# CHECK EMAIL VERIFICATION STATUS
# ---------------------------------------------------------
@app.route("/get_user_auth")
def get_user_auth():
    uid = request.args.get("uid")
    if not uid:
        return jsonify({"error": "Missing uid"}), 400
    try:
        user_record = auth.get_user(uid)
        return jsonify({
            "uid": uid,
            "emailVerified": user_record.email_verified
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ---------------------------
# Run server
# ---------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
