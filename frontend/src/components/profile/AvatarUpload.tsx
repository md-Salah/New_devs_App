import React, { useState, useRef } from 'react';
import { Camera, Upload, X, User, AlertCircle, Check, Image } from 'lucide-react';
import { profileService } from '../../services/profileService';

interface AvatarUploadProps {
  currentAvatarUrl?: string;
  onAvatarUpdate: (url: string | null) => void;
  size?: 'sm' | 'md' | 'lg';
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({ 
  currentAvatarUrl, 
  onAvatarUpdate, 
  size = 'md' 
}) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const sizeClasses = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'
  };

  const iconSizes = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-10 h-10'
  };

  const validateFile = (file: File): string | null => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return 'Please select a valid image file (JPEG, PNG, WebP, or GIF)';
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return 'File size must be less than 5MB';
    }

    return null;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    handleFileUpload(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleFileUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload file
    setUploading(true);
    setError(null);
    try {
      const response = await profileService.uploadAvatar(file);
      onAvatarUpdate(response.avatar_url);
      setSuccess('Avatar updated successfully!');
      setPreviewUrl(null);
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload avatar. Please try again.';
      setError(errorMessage);
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await profileService.deleteAvatar();
      onAvatarUpdate(null);
      setPreviewUrl(null);
      setSuccess('Avatar removed successfully!');
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error deleting avatar:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove avatar';
      setError(errorMessage);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const clearMessages = () => {
    setError(null);
    setSuccess(null);
  };

  const displayUrl = previewUrl || currentAvatarUrl;

  return (
    <div className="flex flex-col items-center space-y-4">
      {/* Messages */}
      {error && (
        <div className="w-full max-w-sm bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="text-red-800 text-xs font-medium">{error}</span>
          </div>
          <button onClick={clearMessages} className="text-red-600 hover:text-red-800">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {success && (
        <div className="w-full max-w-sm bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
          <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="text-green-800 text-xs font-medium">{success}</span>
          </div>
          <button onClick={clearMessages} className="text-green-600 hover:text-green-800">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Avatar Display and Upload Area */}
      <div className="relative group">
        <div 
          ref={dropZoneRef}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`${sizeClasses[size]} rounded-full overflow-hidden bg-gray-100 border-4 ${
            isDragOver ? 'border-primary' : 'border-gray-200'
          } flex items-center justify-center relative transition-all duration-200 ${
            uploading ? 'opacity-60' : 'hover:border-gray-300 cursor-pointer'
          }`}
          onClick={handleClick}
        >
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Profile"
              className="w-full h-full object-cover avatar-image"
            />
          ) : (
            <User className={`${iconSizes[size]} text-gray-400`} />
          )}
          
          {/* Upload overlay */}
          <div className={`absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ${uploading ? 'opacity-100' : ''}`}>
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                <span className="text-white text-xs font-medium">Uploading...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Camera className="w-6 h-6 text-white" />
                <span className="text-white text-xs font-medium">Change</span>
              </div>
            )}
          </div>

          {/* Drag over overlay */}
          {isDragOver && !uploading && (
            <div className="absolute inset-0 bg-primary bg-opacity-80 flex items-center justify-center">
              <div className="flex flex-col items-center gap-1">
                <Upload className="w-6 h-6 text-white" />
                <span className="text-white text-xs font-medium">Drop here</span>
              </div>
            </div>
          )}
        </div>

        {/* Delete button */}
        {currentAvatarUrl && !uploading && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1.5 shadow-lg hover:bg-red-600 transition-colors border-2 border-white"
            title="Remove avatar"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Upload button and instructions */}
      <div className="text-center space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <button
            onClick={handleClick}
            disabled={uploading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Uploading...' : currentAvatarUrl ? 'Change Photo' : 'Upload Photo'}
          </button>
          
          {currentAvatarUrl && !uploading && (
            <button
              onClick={handleDelete}
              className="inline-flex items-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-lg text-red-700 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
            >
              <X className="w-4 h-4 mr-2" />
              Remove
            </button>
          )}
        </div>

        {/* Upload instructions */}
        <div className="text-xs text-gray-500 space-y-1">
          <div className="flex items-center justify-center gap-1">
            <Image className="w-3 h-3" />
            <span>Max 5MB • JPEG, PNG, WebP, GIF</span>
          </div>
          <p>Click, drag & drop, or paste from clipboard</p>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};

export default AvatarUpload;