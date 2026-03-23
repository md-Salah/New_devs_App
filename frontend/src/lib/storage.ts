import { supabase } from './supabase';

export interface ContractMetadata {
  contract_id: string;
  landlord_name: string;
  property_address: string;
  contract_start_date: string;
}

export interface UploadResult {
  success: boolean;
  data?: {
    path: string;
  };
  error?: string;
}

export async function uploadContract({ 
  file, 
  metadata, 
  status 
}: { 
  file: File;
  metadata: ContractMetadata;
  status: string;
}): Promise<UploadResult> {
  try {
    // Generate a unique file name
    const fileExt = file.name.split('.').pop();
    const fileName = `${metadata.contract_id}-${Date.now()}.${fileExt}`;
    const filePath = `${status}/${fileName}`;

    // Upload the file
    const { error: uploadError, data } = await supabase.storage
      .from('landlord-contracts')
      .upload(filePath, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: '3600',
        metadata: metadata as any
      });

    if (uploadError) throw uploadError;

    return {
      success: true,
      data: {
        path: filePath
      }
    };
  } catch (error: any) {
    console.error('Error uploading contract:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export async function getContract(path: string) {
    try {
      const { data, error } = await supabase.storage
        .from('landlord-contracts')
        .download(path);

    if (error) throw error;

    return {
      success: true,
      data
    };
  } catch (error: any) {
    console.error('Error getting contract:', error);
    return {
      success: false,
      error: error.message || 'Failed to get contract'
    };
  }
}

export async function listContracts(status?: 'active' | 'archived' | 'pending') {
  try {
    const path = status ? `${status}/` : '';
    
    const { data, error } = await supabase.storage
      .from('landlord-contracts')
      .list(path, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) throw error;

    return {
      success: true,
      data
    };
  } catch (error: any) {
    console.error('Error listing contracts:', error);
    return {
      success: false,
      error: error.message || 'Failed to list contracts'
    };
  }
}

export async function deleteContract(path: string) {
    try {
      const { error } = await supabase.storage
        .from('landlord-contracts')
        .remove([path]);

    if (error) throw error;

    return {
      success: true
    };
  } catch (error: any) {
    console.error('Error deleting contract:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete contract'
    };
  }
}

export async function moveContract(fromPath: string, toPath: string) {
  try {
    // First download the file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('landlord-contracts')
      .download(fromPath);

    if (downloadError) throw downloadError;

    // Then upload to new location
    const { error: uploadError } = await supabase.storage
      .from('landlord-contracts')
      .upload(toPath, fileData, {
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) throw uploadError;

    // Finally delete the original
    const { error: deleteError } = await supabase.storage
      .from('landlord-contracts')
      .remove([fromPath]);

    if (deleteError) throw deleteError;

    return {
      success: true
    };
  } catch (error: any) {
    console.error('Error moving contract:', error);
    return {
      success: false,
      error: error.message || 'Failed to move contract'
    };
  }
}

// Website Images Storage Functions
export const WEBSITE_IMAGES_BUCKET = 'website-images';

/**
 * Upload an image to Supabase storage for website content
 * @param file - The file to upload
 * @param folder - Optional folder within the bucket
 * @returns The public URL of the uploaded image
 */
export async function uploadWebsiteImage(file: File, folder = 'pages'): Promise<string> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('Only image files are allowed');
    }

    // Validate file size (5MB max)
    if (file.size > 5242880) {
      throw new Error('Image size must be less than 5MB');
    }

    // Generate unique filename
    const fileExt = file.name.split('.').pop();
    const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from(WEBSITE_IMAGES_BUCKET)
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(WEBSITE_IMAGES_BUCKET)
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error('Error uploading image:', error);
    throw error;
  }
}

/**
 * Delete an image from Supabase storage
 * @param url - The public URL of the image
 */
export async function deleteWebsiteImage(url: string): Promise<void> {
  try {
    // Extract path from URL
    const urlParts = url.split('/');
    const bucketIndex = urlParts.indexOf(WEBSITE_IMAGES_BUCKET);
    if (bucketIndex === -1) return;

    const path = urlParts.slice(bucketIndex + 1).join('/');

    const { error } = await supabase.storage
      .from(WEBSITE_IMAGES_BUCKET)
      .remove([path]);

    if (error) {
      console.error('Delete error:', error);
      throw new Error(`Failed to delete image: ${error.message}`);
    }
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
}

/**
 * List all images in a folder
 * @param folder - The folder to list images from
 */
export async function listWebsiteImages(folder = 'pages') {
  try {
    const { data, error } = await supabase.storage
      .from(WEBSITE_IMAGES_BUCKET)
      .list(folder, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) throw error;

    // Get public URLs for all files
    const filesWithUrls = data?.map(file => {
      const { data: { publicUrl } } = supabase.storage
        .from(WEBSITE_IMAGES_BUCKET)
        .getPublicUrl(`${folder}/${file.name}`);
      
      return {
        ...file,
        publicUrl
      };
    }) || [];

    return {
      success: true,
      data: filesWithUrls
    };
  } catch (error: any) {
    console.error('Error listing images:', error);
    return {
      success: false,
      error: error.message || 'Failed to list images'
    };
  }
}
