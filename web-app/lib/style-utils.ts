/**
 * Gets the background style for a color that might be a gradient
 * @param color - Color string (hex or gradient)
 * @returns Style object safe for SSR
 */
export function getBackgroundStyle(color: string | undefined): React.CSSProperties {
  const fallbackColor = '#6B7280';
  const colorValue = color || fallbackColor;
  
  // Check if it's a gradient
  if (colorValue && colorValue.indexOf && colorValue.indexOf('gradient') !== -1) {
    return { background: colorValue };
  }
  
  // For solid colors, use backgroundColor
  return { backgroundColor: colorValue };
}