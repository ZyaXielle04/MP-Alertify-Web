from flask import Flask, request, jsonify, render_template
import firebase_admin
from firebase_admin import credentials, auth, db
import os
import json

# ---------------------------
# Flask app
# ---------------------------
app = Flask(
    __name__,
    template_folder="templates",  # HTML templates live here
    static_folder="static"        # CSS/JS/images live here
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
# ROOT ROUTE - Landing Page
# ---------------------------
@app.route("/")
def home():
    return render_template("index.html")

# ---------------------------
# ADMIN DASHBOARD ROUTE
# ---------------------------
@app.route("/admin/dashboard")
def admin_dashboard():
    return render_template("admin/dashboard.html")

# ---------------------------
# ADMIN - USER MANAGEMENT ROUTE
# ---------------------------
@app.route("/admin/users")
def manage_users():
    return render_template("admin/users.html")

# ---------------------------
# ADMIN - REPORTS MANAGEMENT ROUTE
# ---------------------------
@app.route("/admin/reports")
def view_reports():
    return render_template("admin/reports.html")

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
        # Update Firebase Auth
        auth.update_user(uid, disabled=disable)
        # Update Realtime Database record
        db.reference(f"users/{uid}/disabled").set(disable)

        status = "disabled" if disable else "enabled"
        return jsonify({"success": True, "message": f"User {uid} has been {status}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ---------------------------
# RUN SERVER
# ---------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
