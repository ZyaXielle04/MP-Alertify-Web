from flask import Flask, request, jsonify
import firebase_admin
from firebase_admin import credentials, auth
import os
import json

app = Flask(__name__)

# Initialize Firebase Admin
cred_json = os.environ.get("FIREBASE_ADMIN_JSON")
cred = credentials.Certificate(json.loads(cred_json))
firebase_admin.initialize_app(cred)

# ---------- ROOT ROUTE ----------
@app.route("/")
def home():
    return jsonify({"message": "Flask + Firebase Admin running!"})

# ---------- DISABLE / ENABLE USER ----------
@app.route("/disable_user", methods=["POST"])
def disable_user():
    data = request.json
    uid = data.get("uid")
    disable = data.get("disable")

    if not uid or disable is None:
        return jsonify({"success": False, "error": "Missing uid or disable field"}), 400

    try:
        auth.update_user(uid, disabled=disable)
        from firebase_admin import db
        db.reference(f"users/{uid}/disabled").set(disable)

        status = "disabled" if disable else "enabled"
        return jsonify({"success": True, "message": f"User {uid} has been {status}"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
