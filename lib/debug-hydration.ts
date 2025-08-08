/**
 * Debug utility to log when style objects contain CSS variables
 * This helps identify hydration errors
 */
export function debugStyleObject(style: any, componentName: string): any {
  if (!style || typeof style !== 'object') return style;
  
  const hasCSSVar = Object.keys(style).some(key => key.startsWith('--'));
  
  if (hasCSSVar) {
    console.warn(`[Hydration Warning] Component "${componentName}" has CSS variables in inline styles:`, style);
    
    // Remove CSS variables from style object to prevent hydration errors
    const cleanedStyle: any = {};
    Object.entries(style).forEach(([key, value]) => {
      if (!key.startsWith('--')) {
        cleanedStyle[key] = value;
      }
    });
    
    return cleanedStyle;
  }
  
  return style;
}