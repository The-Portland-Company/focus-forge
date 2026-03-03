/**
 * Safely extracts RGB values from a color string
 * @param color - Hex color or gradient string
 * @returns RGB string like "234, 88, 12"
 */
export function extractRgbFromColor(color: string): string {
  const defaultRgb = '234, 88, 12'; // Default orange
  
  if (!color) return defaultRgb;
  
  let hexColor = color;
  
  // If it's a gradient, extract the first hex color
  if (color.includes('gradient')) {
    const hexMatches = color.match(/#[A-Fa-f0-9]{6}/g);
    if (hexMatches && hexMatches.length > 0) {
      hexColor = hexMatches[0];
    } else {
      return defaultRgb;
    }
  }
  
  // Validate hex color format
  if (!hexColor.startsWith('#') || hexColor.length !== 7) {
    return defaultRgb;
  }
  
  // Extract RGB values
  try {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Validate RGB values
    if (isNaN(r) || isNaN(g) || isNaN(b) || r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
      return defaultRgb;
    }
    
    return `${r}, ${g}, ${b}`;
  } catch (error) {
    return defaultRgb;
  }
}

/**
 * Gets the primary color from a color value (handles gradients)
 * @param color - Color string (hex or gradient)
 * @returns Hex color string
 */
export function getPrimaryColor(color: string): string {
  const defaultColor = '#EA580C'; // Default orange
  
  if (!color) return defaultColor;
  
  // If it's a gradient, extract the first hex color
  if (color.includes('gradient')) {
    const hexMatches = color.match(/#[A-Fa-f0-9]{6}/g);
    if (hexMatches && hexMatches.length > 0) {
      return hexMatches[0];
    } else {
      return defaultColor;
    }
  }
  
  // Validate hex color
  if (color.startsWith('#') && color.length === 7) {
    return color;
  }
  
  return defaultColor;
}