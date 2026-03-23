import React from 'react';
import { theme } from '../../theme/theme';

export interface ButtonProps {
  variant?: 'contained' | 'outlined' | 'text';
  color?: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  size?: 'small' | 'medium' | 'large';
  disabled?: boolean;
  fullWidth?: boolean;
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  type?: 'button' | 'submit' | 'reset';
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'contained',
  color = 'primary',
  size = 'medium',
  disabled = false,
  fullWidth = false,
  children,
  onClick,
  className = '',
  startIcon,
  endIcon,
  type = 'button',
}) => {
  const sizeClasses = {
    small: 'px-3 py-1 text-sm',
    medium: 'px-4 py-2',
    large: 'px-6 py-3 text-lg',
  };

  const variantClasses = {
    contained: `
      bg-${color}-main 
      text-${color}-contrastText
      hover:bg-${color}-dark
      active:bg-${color}-dark
      disabled:bg-gray-300
    `,
    outlined: `
      border-2 
      border-${color}-main
      text-${color}-main
      hover:bg-${color}-main/10
      active:bg-${color}-main/20
      disabled:border-gray-300
      disabled:text-gray-300
    `,
    text: `
      text-${color}-main
      hover:bg-${color}-main/10
      active:bg-${color}-main/20
      disabled:text-gray-300
    `,
  };

  const baseClasses = `
    inline-flex
    items-center
    justify-center
    gap-2
    rounded-md
    font-medium
    transition-all
    duration-${theme.transitions.duration.short}
    ${sizeClasses[size]}
    ${variantClasses[variant]}
    ${fullWidth ? 'w-full' : ''}
    ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
    ${className}
  `;

  return (
    <button
      type={type}
      className={baseClasses}
      onClick={onClick}
      disabled={disabled}
    >
      {startIcon && <span className="inline-flex">{startIcon}</span>}
      {children}
      {endIcon && <span className="inline-flex">{endIcon}</span>}
    </button>
  );
};