from flask import Flask, request, jsonify, send_from_directory
import firebase_admin
from firebase_admin import credentials, auth
import os
import json

app = Flask(__name__)

# ---------------------------
# Initialize Firebase Admin
# ---------------------------
cred_json = os.environ.get("FIREBASE_ADMIN_JSON")
cred = credentials.Certificate(json.loads(cred_json))
firebase_admin.initialize_app(cred)

# ---------------------------
# Paths
# ---------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ---------- ROOT ROUTE (Admin Landing Page) ----------
@app.route("/")
def home():
    return send_from_directory(BASE_DIR, "index.html")

# ---------- STATIC FILES: /admin (CSS/JS) ----------
@app.route("/admin/<path:path>")
def admin_static(path):
    return send_from_directory(os.path.join(BASE_DIR, "admin"), path)

# ---------- ASSETS (Images, etc.) ----------
@app.route("/assets/<path:path>")
def assets_static(path):
    return send_from_directory(os.path.join(BASE_DIR, "assets"), path)

# ---------- DISABLE / ENABLE USER ----------
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
        # Optional: update Realtime Database record
        from firebase_admin import db
        db.reference(f"users/{uid}/disabled").set(disable)

        status = "disabled" if disable else "enabled"
        return jsonify({"success": True, "message": f"User {uid} has been {status}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

# ---------- RUN SERVER ----------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
