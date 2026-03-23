"""
Token Encryption Service
Provides AES-256-GCM encryption for secure token storage
"""

import os
import base64
import json
from typing import Dict, Tuple, Optional, Any
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
import secrets
from datetime import datetime


class TokenEncryptionService:
    """
    Service for encrypting and decrypting tokens using AES-256-GCM
    """
    
    def __init__(self, master_key: Optional[str] = None):
        """
        Initialize the encryption service
        
        Args:
            master_key: Master encryption key (should be passed from settings)
        """
        self.master_key = master_key
        if not self.master_key:
            # Fallback to environment variable for backward compatibility
            self.master_key = os.getenv('TOKEN_ENCRYPTION_KEY')
        
        if not self.master_key:
            raise ValueError("TOKEN_ENCRYPTION_KEY must be provided either as parameter or environment variable")
        
        # Derive encryption key from master key using PBKDF2
        self.encryption_key = self._derive_key(self.master_key)
        
    def _derive_key(self, master_key: str, salt: Optional[bytes] = None) -> bytes:
        """
        Derive an encryption key from the master key using PBKDF2
        
        Args:
            master_key: The master key string
            salt: Optional salt for key derivation
            
        Returns:
            32-byte derived key for AES-256
        """
        if salt is None:
            # Use a fixed salt for consistency (you might want to make this configurable)
            salt = b'flex-pms-token-encryption-salt-v1'
        
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,  # 32 bytes for AES-256
            salt=salt,
            iterations=100000,
            backend=default_backend()
        )
        
        return kdf.derive(master_key.encode())
    
    def encrypt_token(self, token: str) -> Tuple[str, str, str]:
        """
        Encrypt a token using AES-256-GCM
        
        Args:
            token: The plaintext token to encrypt
            
        Returns:
            Tuple of (encrypted_value, iv, auth_tag) all base64 encoded
        """
        # Generate a random 96-bit IV (recommended for GCM)
        iv = os.urandom(12)
        
        # Create cipher
        cipher = Cipher(
            algorithms.AES(self.encryption_key),
            modes.GCM(iv),
            backend=default_backend()
        )
        
        encryptor = cipher.encryptor()
        
        # Encrypt the token
        encrypted = encryptor.update(token.encode()) + encryptor.finalize()
        
        # Get the authentication tag
        auth_tag = encryptor.tag
        
        # Base64 encode everything for storage
        encrypted_b64 = base64.b64encode(encrypted).decode('utf-8')
        iv_b64 = base64.b64encode(iv).decode('utf-8')
        tag_b64 = base64.b64encode(auth_tag).decode('utf-8')
        
        return encrypted_b64, iv_b64, tag_b64
    
    def decrypt_token(self, encrypted_value: str, iv: str, auth_tag: str) -> str:
        """
        Decrypt a token using AES-256-GCM
        
        Args:
            encrypted_value: Base64 encoded encrypted token
            iv: Base64 encoded initialization vector
            auth_tag: Base64 encoded authentication tag
            
        Returns:
            The decrypted token string
        """
        # Decode from base64
        encrypted_bytes = base64.b64decode(encrypted_value)
        iv_bytes = base64.b64decode(iv)
        tag_bytes = base64.b64decode(auth_tag)
        
        # Create cipher with the tag
        cipher = Cipher(
            algorithms.AES(self.encryption_key),
            modes.GCM(iv_bytes, tag_bytes),
            backend=default_backend()
        )
        
        decryptor = cipher.decryptor()
        
        # Decrypt
        decrypted = decryptor.update(encrypted_bytes) + decryptor.finalize()
        
        return decrypted.decode('utf-8')
    
    def get_token_hint(self, token: str) -> str:
        """
        Get a hint for the token (last 4 characters)
        
        Args:
            token: The plaintext token
            
        Returns:
            Token hint string like "...abc123"
        """
        if len(token) <= 4:
            return "..." + "*" * len(token)
        return "..." + token[-4:]
    
    def rotate_encryption_key(self, new_master_key: str, tokens_to_rotate: list) -> list:
        """
        Rotate the encryption key and re-encrypt all tokens
        
        Args:
            new_master_key: The new master encryption key
            tokens_to_rotate: List of dicts with encrypted token data
            
        Returns:
            List of re-encrypted tokens with new encryption
        """
        # Derive new encryption key
        new_encryption_key = self._derive_key(new_master_key)
        
        rotated_tokens = []
        
        for token_data in tokens_to_rotate:
            # Decrypt with old key
            decrypted = self.decrypt_token(
                token_data['encrypted_value'],
                token_data['encryption_iv'],
                token_data['encryption_tag']
            )
            
            # Store old encryption key temporarily
            old_key = self.encryption_key
            
            # Switch to new key
            self.encryption_key = new_encryption_key
            
            # Encrypt with new key
            new_encrypted, new_iv, new_tag = self.encrypt_token(decrypted)
            
            # Restore old key (in case we need to continue processing)
            self.encryption_key = old_key
            
            rotated_tokens.append({
                'id': token_data['id'],
                'encrypted_value': new_encrypted,
                'encryption_iv': new_iv,
                'encryption_tag': new_tag,
                'token_hint': self.get_token_hint(decrypted)
            })
        
        # Finally switch to new key permanently
        self.master_key = new_master_key
        self.encryption_key = new_encryption_key
        
        return rotated_tokens
    
    @staticmethod
    def generate_master_key() -> str:
        """
        Generate a new secure master key
        
        Returns:
            A secure random master key (base64 encoded)
        """
        # Generate 32 random bytes (256 bits)
        key_bytes = secrets.token_bytes(32)
        # Base64 encode for easy storage in environment variables
        return base64.b64encode(key_bytes).decode('utf-8')
    
    def validate_token_format(self, token: str, token_type: str) -> bool:
        """
        Validate token format based on type
        
        Args:
            token: The token to validate
            token_type: Type of token ('hostaway', 'stripe', etc.)
            
        Returns:
            True if valid format, False otherwise
        """
        if not token or not isinstance(token, str):
            return False
        
        if token_type == 'stripe':
            # Stripe tokens usually start with sk_ or pk_
            return token.startswith(('sk_', 'pk_', 'whsec_'))
        elif token_type == 'hostaway':
            # Hostaway tokens are JWT format (header.payload.signature)
            # They contain dots, letters, numbers, hyphens, and underscores
            parts = token.split('.')
            return len(parts) == 3 and len(token) >= 20
        else:
            # Basic validation for other types
            return len(token) >= 10
    
    def create_token_metadata(self, token_type: str, purpose: str, additional_data: Optional[Dict] = None) -> Dict:
        """
        Create metadata for token storage
        
        Args:
            token_type: Type of token
            purpose: Purpose of the token
            additional_data: Any additional metadata
            
        Returns:
            Dictionary of metadata
        """
        metadata = {
            'token_type': token_type,
            'purpose': purpose,
            'created_at': datetime.utcnow().isoformat(),
            'version': '1.0',
            'encryption_method': 'AES-256-GCM'
        }
        
        if additional_data:
            metadata.update(additional_data)
        
        return metadata


class TokenCache:
    """
    In-memory cache for decrypted tokens to avoid repeated decryption
    """
    
    def __init__(self, ttl_seconds: int = 300):
        """
        Initialize token cache
        
        Args:
            ttl_seconds: Time to live for cached tokens (default 5 minutes)
        """
        self._cache: Dict[str, Tuple[str, datetime]] = {}
        self.ttl_seconds = ttl_seconds
    
    def get(self, token_id: str) -> Optional[str]:
        """
        Get a cached token if it exists and is not expired
        
        Args:
            token_id: The token ID
            
        Returns:
            The cached token or None if not found/expired
        """
        if token_id in self._cache:
            token, timestamp = self._cache[token_id]
            if (datetime.utcnow() - timestamp).total_seconds() < self.ttl_seconds:
                return token
            else:
                # Remove expired token
                del self._cache[token_id]
        return None
    
    def set(self, token_id: str, token: str) -> None:
        """
        Cache a token
        
        Args:
            token_id: The token ID
            token: The decrypted token
        """
        self._cache[token_id] = (token, datetime.utcnow())
    
    def clear(self) -> None:
        """Clear all cached tokens"""
        self._cache.clear()
    
    def remove(self, token_id: str) -> None:
        """Remove a specific token from cache"""
        if token_id in self._cache:
            del self._cache[token_id]