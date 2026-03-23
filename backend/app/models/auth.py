from pydantic import BaseModel, EmailStr
from typing import List, Optional

class User(BaseModel):
    id: str
    email: EmailStr
    permissions: List[dict]
    cities: List[str]
    is_admin: bool

class Permission(BaseModel):
    section: str
    action: str

class AuthenticatedUser(BaseModel):
    id: str
    email: str
    permissions: List[Permission]
    cities: List[str]
    is_admin: bool
    tenant_id: Optional[str] = None
