/**
 * Creates SSR-safe style objects by ensuring CSS variables are not included
 * CSS variables should only be set via document.style.setProperty, not inline styles
 */
export function createSSRSafeStyle(style?: React.CSSProperties | Record<string, any>): React.CSSProperties | undefined {
  if (!style) return undefined;
  
  const safeStyle: React.CSSProperties = {};
  
  Object.entries(style).forEach(([key, value]) => {
    // Skip CSS variables (properties starting with --)
    if (!key.startsWith('--')) {
      (safeStyle as any)[key] = value;
    }
  });
  
  return safeStyle;
}

/**
 * Hook to ensure styles are SSR-safe
 */
export function useSSRSafeStyle(style?: React.CSSProperties | Record<string, any>): React.CSSProperties | undefined {
  return createSSRSafeStyle(style);
}