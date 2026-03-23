export type SignupAccessRecord = {
  granted: boolean;
  ts: number; // epoch ms
};

const STORAGE_KEY = 'signup_admin_access';

export function hasSignupAccess(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const rec = JSON.parse(raw) as SignupAccessRecord;
    return !!rec?.granted;
  } catch {
    return false;
  }
}

export function grantSignupAccess(): void {
  const rec: SignupAccessRecord = { granted: true, ts: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
}

export function revokeSignupAccess(): void {
  localStorage.removeItem(STORAGE_KEY);
}

