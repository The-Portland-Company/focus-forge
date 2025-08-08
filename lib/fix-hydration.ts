/**
 * Fixes hydration errors caused by CSS variables in inline styles
 * This should be imported and called at the top of the app
 */
export function fixHydrationErrors() {
  if (typeof window === 'undefined') return;

  // Override React's createElement to clean style props
  const originalCreateElement = (window as any).React?.createElement;
  
  if (originalCreateElement) {
    (window as any).React.createElement = function(type: any, props: any, ...children: any[]) {
      if (props && props.style && typeof props.style === 'object') {
        // Clean CSS variables from style objects
        const cleanedStyle: any = {};
        let hasCSSVar = false;
        
        Object.entries(props.style).forEach(([key, value]) => {
          if (key.startsWith('--')) {
            hasCSSVar = true;
            console.warn('[Hydration Fix] Removed CSS variable from inline style:', key, value);
          } else {
            cleanedStyle[key] = value;
          }
        });
        
        if (hasCSSVar) {
          props = { ...props, style: cleanedStyle };
        }
      }
      
      return originalCreateElement.apply(this, [type, props, ...children]);
    };
  }
}