"""
Authentication Module
Provides optional API key authentication for local development.

If API_SECRET_KEY is set in .env, all /gen, /gen2, and /api/* mutation endpoints
require a Bearer token. If not set, auth is disabled (local dev mode).
"""

import os
import secrets
import logging
from functools import wraps
from flask import request, jsonify

logger = logging.getLogger(__name__)

# Generate a random secret on startup if none configured
_api_secret = os.getenv("API_SECRET_KEY", "")
if not _api_secret:
    _api_secret = secrets.token_urlsafe(32)
    logger.info(f"API auth disabled (no API_SECRET_KEY in .env). Generated dev token: {_api_secret[:8]}...")
    logger.info("To enable auth, add API_SECRET_KEY to your .env file.")

AUTH_ENABLED = bool(os.getenv("API_SECRET_KEY", ""))


def get_api_secret() -> str:
    """Get the current API secret key."""
    return _api_secret


def require_auth(f):
    """Decorator to require API authentication on endpoints.

    Only enforced when API_SECRET_KEY is set in .env.
    When not set, all requests pass through (local dev mode).
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if not AUTH_ENABLED:
            return f(*args, **kwargs)

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401

        token = auth_header[7:]  # Remove "Bearer " prefix
        if token != _api_secret:
            return jsonify({"error": "Invalid API key"}), 401

        return f(*args, **kwargs)
    return decorated
