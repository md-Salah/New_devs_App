from pydantic import BaseModel, EmailStr, HttpUrl
from typing import List, Optional, Dict, Any
from datetime import datetime

class UserProfileBase(BaseModel):
    display_name: Optional[str] = None
    bio: Optional[str] = None
    phone: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None
    location: Optional[str] = None
    timezone: str = "UTC"
    language: str = "en"
    theme: str = "light"

class UserProfileCreate(UserProfileBase):
    pass

class UserProfileUpdate(UserProfileBase):
    pass

class UserProfile(UserProfileBase):
    id: str
    user_id: str
    avatar_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class UserPreferencesBase(BaseModel):
    notification_email: bool = True
    notification_push: bool = True
    notification_desktop: bool = True
    notification_sound: bool = True
    auto_refresh: bool = True
    compact_view: bool = False
    sidebar_collapsed: bool = False

class UserPreferencesUpdate(UserPreferencesBase):
    pass

class UserPreferences(UserPreferencesBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class NotificationPreferenceBase(BaseModel):
    category: str
    email_enabled: bool = True
    push_enabled: bool = True
    desktop_enabled: bool = True
    sound_enabled: bool = True

class NotificationPreferenceCreate(NotificationPreferenceBase):
    pass

class NotificationPreferenceUpdate(BaseModel):
    email_enabled: Optional[bool] = None
    push_enabled: Optional[bool] = None
    desktop_enabled: Optional[bool] = None
    sound_enabled: Optional[bool] = None

class NotificationPreference(NotificationPreferenceBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class AvatarUploadResponse(BaseModel):
    avatar_url: str
    message: str

class ProfileResponse(BaseModel):
    profile: UserProfile
    preferences: UserPreferences
    notification_preferences: List[NotificationPreference]
    unread_count: int