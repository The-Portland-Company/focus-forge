import React from 'react';

interface SafeStyleWrapperProps {
  style?: React.CSSProperties;
  className?: string;
  children: React.ReactNode;
  as?: React.ElementType;
}

/**
 * A wrapper component that ensures CSS variables are never included in inline styles
 * This prevents hydration errors when CSS variables are accidentally included
 */
export function SafeStyleWrapper({ 
  style, 
  className, 
  children, 
  as: Component = 'div',
  ...rest 
}: SafeStyleWrapperProps & React.HTMLAttributes<HTMLElement>) {
  // Filter out any CSS variables from the style object
  const safeStyle = style ? Object.entries(style).reduce((acc, [key, value]) => {
    if (!key.startsWith('--')) {
      acc[key as keyof React.CSSProperties] = value;
    }
    return acc;
  }, {} as React.CSSProperties) : undefined;

  return React.createElement(
    Component,
    { style: safeStyle, className, ...rest },
    children
  );
}