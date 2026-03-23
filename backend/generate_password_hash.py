#!/usr/bin/env python3
"""
Script to generate secure password hash for admin signup authentication.
Usage: python generate_password_hash.py
"""

import hashlib
import getpass
import bcrypt

def generate_sha256_hash(password: str) -> str:
    """Generate SHA256 hash (simple but less secure)"""
    return hashlib.sha256(password.encode()).hexdigest()

def generate_bcrypt_hash(password: str) -> str:
    """Generate bcrypt hash (more secure, recommended for production)"""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode(), salt).decode()

if __name__ == "__main__":
    print("Admin Password Hash Generator")
    print("=" * 40)
    
    # Get password securely
    password = getpass.getpass("Enter admin password: ")
    confirm = getpass.getpass("Confirm admin password: ")
    
    if password != confirm:
        print("❌ Passwords do not match!")
        exit(1)
    
    # Generate hashes
    sha256_hash = generate_sha256_hash(password)
    
    print("\n✅ Password hashes generated successfully!\n")
    print("SHA256 Hash (current implementation):")
    print(f"  {sha256_hash}")
    print("\nTo use this hash, set the following environment variable:")
    print(f"  export SIGNUP_ADMIN_PASSWORD_HASH='{sha256_hash}'")
    
    # Check if bcrypt is available
    try:
        bcrypt_hash = generate_bcrypt_hash(password)
        print("\nBcrypt Hash (recommended for production):")
        print(f"  {bcrypt_hash}")
        print("\nTo upgrade to bcrypt, modify signup_auth.py to use bcrypt")
    except Exception:
        print("\n⚠️  Install bcrypt for more secure hashing: pip install bcrypt")
    
    print("\n" + "=" * 40)
    print("⚠️  Security Recommendations:")
    print("  1. Never commit password or hashes to version control")
    print("  2. Use environment variables or secret management service")
    print("  3. Consider using bcrypt for production deployments")
    print("  4. Rotate passwords regularly")
    print("  5. Monitor failed login attempts")