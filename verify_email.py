import firebase_admin
from firebase_admin import credentials, auth

# ---------------------------
# 1. Initialize Firebase Admin
# ---------------------------
cred = credentials.Certificate("serviceKey.json")  # Replace with your Firebase service key
firebase_admin.initialize_app(cred)

# ---------------------------
# 2. Get emails from user input
# ---------------------------
emails_input = input("Enter emails to verify (separated by commas): ")
emails = [e.strip() for e in emails_input.split(",") if e.strip()]

if not emails:
    print("No valid emails entered. Exiting.")
    exit(1)

# ---------------------------
# 3. Verify emails
# ---------------------------
for email in emails:
    try:
        user = auth.get_user_by_email(email)
        auth.update_user(user.uid, email_verified=True)
        print(f"✅ Email for {user.email} has been automatically verified.")
    except auth.UserNotFoundError:
        print(f"⚠️ No user found with email: {email}")
    except Exception as e:
        print(f"❌ Error verifying {email}: {e}")
