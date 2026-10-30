"""Check the Google OAuth client config without signing in. Prints no secrets.

Opens Google's authorize URL for the NextAuth callback and reports Google's error, if any
(invalid_client, redirect_uri_mismatch, ...). Also checks the Classroom API is reachable.
"""

import os
import re
import sys
from pathlib import Path
from urllib.parse import urlencode, urlsplit

import httpx
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8")
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

cid = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
base = os.environ.get("NEXTAUTH_URL", "http://localhost:3000").strip().rstrip("/")
u = urlsplit(base)
print(f"NEXTAUTH_URL host: {u.scheme}://{u.netloc}{u.path}")
print(f"GOOGLE_CLIENT_ID looks like a web client id: {cid.endswith('.apps.googleusercontent.com')}")
redirect = f"{base}/api/auth/callback/google"
scopes = "openid email profile https://www.googleapis.com/auth/classroom.courses"
url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
    {"client_id": cid, "redirect_uri": redirect, "response_type": "code", "scope": scopes, "access_type": "offline", "prompt": "consent"}
)
r = httpx.get(url, follow_redirects=True, timeout=30)
text = r.text
err = re.search(r"(invalid_client|redirect_uri_mismatch|unauthorized_client|disabled_client|deleted_client|invalid_request|access_denied|org_internal)", text)
print(f"Google authorize page: HTTP {r.status_code}; error marker: {err.group(1) if err else 'none'}")
if not err and ("identifier" in text or "Sign in" in text or "signin" in str(r.url)):
    print("=> Google accepts this client id and redirect URI (it shows the sign-in page).")
print(f"Redirect URI that must be registered in Google Cloud: {redirect}")
