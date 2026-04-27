from fastapi import APIRouter, Request, Response, HTTPException, Depends
from fastapi.responses import JSONResponse
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from pydantic import BaseModel

from .config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])

_serializer = URLSafeTimedSerializer(settings.cookie_secret)
_PAYLOAD = "authenticated"


def _make_cookie(response: Response) -> None:
    token = _serializer.dumps(_PAYLOAD)
    response.set_cookie(
        key=settings.cookie_name,
        value=token,
        httponly=True,
        samesite="lax",
        max_age=settings.cookie_max_age,
        path="/",
    )


def require_auth(request: Request) -> None:
    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        _serializer.loads(token, max_age=settings.cookie_max_age)
    except (BadSignature, SignatureExpired):
        raise HTTPException(status_code=401, detail="Session expired")


Auth = Depends(require_auth)


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
async def login(body: LoginRequest, response: Response):
    if body.password != settings.reader_password:
        raise HTTPException(status_code=401, detail="Wrong password")
    _make_cookie(response)
    return {"ok": True}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(settings.cookie_name, path="/")
    return {"ok": True}


@router.get("/verify")
async def verify(request: Request):
    """Used by nginx auth_request to validate the session cookie."""
    require_auth(request)
    return {"ok": True}
