'use client'

export default function HydrationTest() {
  // This component helps identify where the hydration error is coming from
  if (typeof window !== 'undefined') {
    // Check all elements with style attributes
    const elementsWithStyle = document.querySelectorAll('[style]');
    elementsWithStyle.forEach(el => {
      const style = el.getAttribute('style');
      if (style && style.includes('--user-profile-color')) {
        console.error('[HydrationTest] Found element with CSS variable in style:', {
          element: el,
          style: style,
          tagName: el.tagName,
          className: el.className,
          id: el.id
        });
      }
    });
  }
  
  return null;
}