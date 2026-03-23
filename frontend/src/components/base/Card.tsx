import React from 'react';
import { theme } from '../../theme/theme';

export interface CardProps {
  elevation?: 1 | 2 | 3;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({ 
  elevation = 1, 
  children, 
  className = '',
  onClick,
  hoverable = false,
}) => {
  const baseClasses = `
    rounded-lg 
    bg-white 
    dark:bg-gray-800 
    transition-all
    duration-${theme.transitions.duration.standard}
    ${theme.shadows[elevation]}
    ${hoverable ? 'hover:shadow-lg hover:-translate-y-1' : ''}
    ${onClick ? 'cursor-pointer' : ''}
    ${className}
  `;

  return (
    <div 
      className={baseClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
};