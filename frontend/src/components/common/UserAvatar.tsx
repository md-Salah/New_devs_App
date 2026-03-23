import React, { useState } from 'react';
import { User } from 'lucide-react';

interface UserAvatarProps {
  user?: {
    id?: string;
    name?: string;
    full_name?: string;
    email?: string;
    avatar_url?: string;
  };
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showTooltip?: boolean;
}

const UserAvatar: React.FC<UserAvatarProps> = ({ 
  user, 
  size = 'md', 
  className = '', 
  showTooltip = false 
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  const sizeClasses = {
    xs: 'w-4 h-4 text-xs',
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
    xl: 'w-12 h-12 text-lg'
  };

  const getDisplayName = () => {
    if (!user) return 'U';
    return user.full_name || user.name || user.email?.split('@')[0] || 'U';
  };

  const getInitials = () => {
    const displayName = getDisplayName();
    if (displayName === 'U') return 'U';
    
    // Split by spaces and take first letter of each word, max 2 letters
    const words = displayName.split(' ').filter(word => word.length > 0);
    if (words.length === 1) {
      return words[0].charAt(0).toUpperCase();
    }
    return words.slice(0, 2).map(word => word.charAt(0).toUpperCase()).join('');
  };

  const hasValidAvatar = user?.avatar_url && !imageError;

  const handleImageLoad = () => {
    setImageLoading(false);
  };

  const handleImageError = () => {
    setImageError(true);
    setImageLoading(false);
  };

  const avatarContent = (
    <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center relative overflow-hidden ${className}`}>
      {hasValidAvatar ? (
        <>
          <img
            src={user.avatar_url}
            alt={getDisplayName()}
            className={`w-full h-full object-cover avatar-image transition-opacity duration-200 ${
              imageLoading ? 'opacity-0' : 'opacity-100'
            }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
          {imageLoading && (
            <div className="absolute inset-0 bg-primary text-white flex items-center justify-center font-medium">
              {getInitials()}
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full bg-primary text-white flex items-center justify-center font-medium">
          {getInitials()}
        </div>
      )}
    </div>
  );

  if (showTooltip && user) {
    return (
      <div className="relative group">
        {avatarContent}
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50">
          {getDisplayName()}
          {user.email && user.email !== getDisplayName() && (
            <div className="text-gray-300">{user.email}</div>
          )}
        </div>
      </div>
    );
  }

  return avatarContent;
};

export default UserAvatar;