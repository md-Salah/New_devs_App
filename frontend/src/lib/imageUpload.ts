import { supabase, adminClient } from './supabase';
import imageCompression from 'browser-image-compression';
import heic2any from 'heic2any';

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/quicktime',
  'video/mov',  // Additional common video format
  'video/x-msvideo'
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // Increase to 100MB to accommodate videos

interface UploadOptions {
  maxSizeMB?: number;
  allowedTypes?: string[];
  generateUniqueName?: boolean;
  customPath?: string;
}

export async function validateImage(file: File): Promise<{ valid: boolean; error?: string }> {
  // Check file type
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`
    };
  }

  return { valid: true };
}

/**
 * Sanitizes a filename by removing special characters and replacing spaces
 * @param filename - The original filename
 * @returns A sanitized filename safe for storage
 */
function sanitizeFilename(filename: string): string {
  // Get the file extension
  const lastDotIndex = filename.lastIndexOf('.');
  const extension = lastDotIndex !== -1 ? filename.slice(lastDotIndex) : '';
  const nameWithoutExt = lastDotIndex !== -1 ? filename.slice(0, lastDotIndex) : filename;
  
  // Remove special characters, keep only alphanumeric, dashes, and underscores
  // Replace spaces with underscores
  const sanitizedName = nameWithoutExt
    .replace(/[^\w\s-]/g, '') // Remove special characters except spaces, dashes, underscores
    .replace(/\s+/g, '_')      // Replace spaces with underscores
    .replace(/-+/g, '-')       // Replace multiple dashes with single dash
    .replace(/_+/g, '_')       // Replace multiple underscores with single underscore
    .replace(/^-+|-+$/g, '');  // Remove leading/trailing dashes
  
  // If the name is empty after sanitization, use a default name
  const finalName = sanitizedName || 'file';
  
  return finalName + extension;
}

export async function uploadImage(
  file: File,
  bucket: string,
  options: UploadOptions = {}
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const {
      maxSizeMB = 1,
      allowedTypes = ALLOWED_MIME_TYPES,
      generateUniqueName = true,
      customPath
    } = options;

    // Validate file type
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Invalid file type. Allowed types: ${allowedTypes.join(', ')}`);
    }

    let processedFile = file;

    // Convert HEIC/HEIF to JPEG if necessary
    if (file.type === 'image/heic' || file.type === 'image/heif') {
      const blob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8
      });
      processedFile = new File([blob as Blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
        type: 'image/jpeg'
      });
    }

    // Compress image if it's not a video and not a HEIC/HEIF file
    if (!file.type.includes('video') && file.type !== 'image/heic' && file.type !== 'image/heif') {
      processedFile = await imageCompression(file, {
        maxSizeMB,
        maxWidthOrHeight: 1920,
        useWebWorker: true
      });
    }

    // Sanitize the filename to remove special characters
    const sanitizedFilename = sanitizeFilename(file.name);

    // Use custom path if provided, otherwise generate a unique name
    const filePath = customPath || (generateUniqueName
      ? `${Date.now()}_${Math.random().toString(36).substring(2)}_${sanitizedFilename}`
      : sanitizedFilename);

    const { data, error: uploadError } = await adminClient.storage
      .from(bucket)
      .upload(filePath, processedFile, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get the public URL
    const { data: { publicUrl } } = adminClient.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      url: publicUrl,
      error: null
    };
  } catch (error) {
    console.error('Error uploading image:', error);
    return {
      url: null,
      error: error as Error
    };
  }
}

export async function uploadVideo(
  file: File,
  bucket: string,
  options: UploadOptions = {}
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const {
      customPath
    } = options;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      throw new Error('Invalid file type. Must be a video file.');
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Sanitize the filename to remove special characters
    const sanitizedFilename = sanitizeFilename(file.name);

    // Use custom path if provided, otherwise generate a unique name
    const filePath = customPath || `${Date.now()}_${Math.random().toString(36).substring(2)}_${sanitizedFilename}`;

    // Upload the file using standard upload
    const { data, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (uploadError) throw uploadError;

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      url: publicUrl,
      error: null
    };
  } catch (error) {
    console.error('Error uploading video:', error);
    return {
      url: null,
      error: error as Error
    };
  }
}

/**
 * Upload a location image from a temporary Google Places URL to Supabase Storage
 * @param imageUrl - Temporary Google Places image URL
 * @param placeId - Google Place ID (used for unique filename)
 * @returns Promise<string | null> - Permanent Supabase Storage URL or null if failed
 */
export async function uploadLocationImageFromUrl(
  imageUrl: string,
  placeId: string
): Promise<string | null> {
  try {
    const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

    // Get auth headers
    const { data: { session } } = await supabase.auth.getSession();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': session?.access_token ? `Bearer ${session.access_token}` : ''
    };

    // Call backend endpoint to download from Google and upload to Supabase
    const response = await fetch(`${API_BASE_URL}/api/v1/nearby-locations/upload-photo`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        photo_url: imageUrl,
        place_id: placeId
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Backend upload failed:', errorData);
      return null;
    }

    const result = await response.json();

    if (!result.success || !result.photo_url) {
      console.error('Upload failed:', result.error);
      return null;
    }

    return result.photo_url;
  } catch (error) {
    console.error('Error uploading location image via backend:', error);
    return null;
  }
}

/**
 * Delete a location image from Supabase Storage
 * @param photoUrl - The Supabase Storage URL to delete
 * @returns Promise<boolean> - True if successful, false otherwise
 */
export async function deleteLocationImage(photoUrl: string): Promise<boolean> {
  try {
    // Extract file path from URL
    // Example URL: https://project.supabase.co/storage/v1/object/public/nearby-location-photos/nearby-locations/place_123_456.jpg
    const urlParts = photoUrl.split('/nearby-location-photos/');
    if (urlParts.length !== 2) {
      console.error('Invalid photo URL format');
      return false;
    }

    const filePath = urlParts[1];

    const { error } = await supabase.storage
      .from('nearby-location-photos')
      .remove([filePath]);

    if (error) {
      console.error('Failed to delete image from Supabase Storage:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error deleting location image:', error);
    return false;
  }
}
