"""Checks that a caller is signed in to the Evidence Hub and is an investigator.

The browser sends the hub's Supabase access token as a bearer token. We verify
its signature (project JWKS, or the HS256 secret if one is configured), then ask
the hub's database whether that user is an investigator. Answers are cached for
five minutes.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx
import jwt
from fastapi import HTTPException, Request

from .config import Settings


@dataclass(frozen=True)
class Caller:
    user_id: str
    email: str | None
    token: str

    @property
    def handler(self) -> str:
        return self.email or self.user_id


class Authenticator:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._jwks = (
            jwt.PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True)
            if settings.supabase_url and not settings.supabase_jwt_secret
            else None
        )
        self._investigators: dict[str, float] = {}

    def _decode(self, token: str) -> dict:
        options = {"require": ["exp", "sub"]}
        if self.settings.supabase_jwt_secret:
            return jwt.decode(
                token, self.settings.supabase_jwt_secret, algorithms=["HS256"],
                audience="authenticated", options=options,
            )
        if self._jwks is None:
            raise HTTPException(503, "Gateway sign-in check is not configured")
        key = self._jwks.get_signing_key_from_jwt(token)
        return jwt.decode(
            token, key.key, algorithms=["ES256", "RS256"], audience="authenticated", options=options,
        )

    def _is_investigator(self, user_id: str, token: str) -> bool:
        cached = self._investigators.get(user_id)
        if cached and cached > time.time():
            return True
        resp = httpx.post(
            f"{self.settings.supabase_url}/rest/v1/rpc/is_investigator",
            json={"_user_id": user_id},
            headers={"apikey": self.settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
            timeout=10,
        )
        ok = resp.status_code == 200 and resp.json() is True
        if ok:
            self._investigators[user_id] = time.time() + 300
        return ok

    def __call__(self, request: Request) -> Caller:
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            raise HTTPException(401, "Sign in to the Evidence Hub first")
        token = header[7:].strip()
        try:
            claims = self._decode(token)
        except HTTPException:
            raise
        except Exception as exc:  # noqa: BLE001 - any token problem is a 401
            raise HTTPException(401, "Your Evidence Hub sign-in has expired. Sign in again.") from exc
        user_id = str(claims["sub"])
        if not self._is_investigator(user_id, token):
            raise HTTPException(403, "This account is not an investigator in the Evidence Hub")
        return Caller(user_id=user_id, email=claims.get("email"), token=token)
