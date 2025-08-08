/**
 * Utilities for safely handling CSS variables to prevent hydration errors
 */

/**
 * Sets CSS variables on the document root element
 * This should only be called in useEffect or event handlers to avoid hydration mismatches
 */
export function setCSSVariables(variables: Record<string, string>) {
  if (typeof window === 'undefined') return;
  
  const root = document.documentElement;
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

/**
 * Gets a CSS variable value from the document root element
 */
export function getCSSVariable(variableName: string): string {
  if (typeof window === 'undefined') return '';
  
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variableName)
    .trim();
}

/**
 * Ensures that style objects don't contain CSS variables
 * CSS variables should be set on the root element, not as inline styles
 */
export function sanitizeStyleObject(style: React.CSSProperties | undefined): React.CSSProperties | undefined {
  if (!style) return style;
  
  const sanitized: React.CSSProperties = {};
  
  Object.entries(style).forEach(([key, value]) => {
    // Skip any CSS variable properties
    if (!key.startsWith('--')) {
      sanitized[key as keyof React.CSSProperties] = value;
    }
  });
  
  return sanitized;
}