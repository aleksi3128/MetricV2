"""Domaine Passkey — WebAuthn, le mot de passe gardé en secours (`docs/exploitation-securite.md`)."""

from app.domains.passkey.router import public_router, router

__all__ = ["public_router", "router"]
