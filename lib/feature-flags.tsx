/**
 * Feature Flags System
 * Controls feature availability based on environment and deployment target
 * This ensures the web app remains unchanged while enabling mobile features
 */

interface FeatureFlags {
  // Database features
  useSupabase: boolean
  enableOfflineMode: boolean
  
  // Authentication features
  requireAuth: boolean
  enableBiometric: boolean
  
  // Platform features
  isMobile: boolean
  isIOS: boolean
  isAndroid: boolean
  isWeb: boolean
  
  // UI features
  enableMobileGestures: boolean
  showMobileNavigation: boolean
  useMobileOptimizedModals: boolean
  
  // Sync features
  enableRealtimeSync: boolean
  enableBackgroundSync: boolean
  
  // Native features
  enablePushNotifications: boolean
  enableHapticFeedback: boolean
  enableNativeShare: boolean
}

/**
 * Get current feature flags based on environment
 */
export function getFeatureFlags(): FeatureFlags {
  // Check if we're in a browser environment
  const isBrowser = typeof window !== 'undefined'
  
  // Environment variables (compile-time)
  const useSupabase = process.env.NEXT_PUBLIC_USE_SUPABASE === 'true'
  const requireAuth = process.env.NEXT_PUBLIC_REQUIRE_AUTH === 'true'
  const isMobileEnv = process.env.NEXT_PUBLIC_IS_MOBILE === 'true'
  
  // Runtime platform detection
  let isIOS = false
  let isAndroid = false
  let isCapacitor = false
  
  if (isBrowser) {
    // Check for Capacitor
    isCapacitor = !!(window as any).Capacitor
    
    // Platform detection
    const userAgent = navigator.userAgent || navigator.vendor || ''
    isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream
    isAndroid = /android/i.test(userAgent)
  }
  
  // Determine if we're running as mobile app
  const isMobile = isMobileEnv || isCapacitor || isIOS || isAndroid
  const isWeb = !isMobile
  
  return {
    // Database features
    useSupabase,
    enableOfflineMode: isMobile && useSupabase,
    
    // Authentication features
    requireAuth: requireAuth && isMobile, // Only require auth on mobile
    enableBiometric: isMobile && isCapacitor,
    
    // Platform features
    isMobile,
    isIOS,
    isAndroid,
    isWeb,
    
    // UI features
    enableMobileGestures: isMobile,
    showMobileNavigation: isMobile,
    useMobileOptimizedModals: isMobile,
    
    // Sync features
    enableRealtimeSync: useSupabase && isMobile,
    enableBackgroundSync: isMobile && isCapacitor,
    
    // Native features (only available in Capacitor)
    enablePushNotifications: isMobile && isCapacitor,
    enableHapticFeedback: isMobile && isCapacitor && isIOS,
    enableNativeShare: isMobile && isCapacitor,
  }
}

/**
 * Hook for using feature flags in React components
 */
export function useFeatureFlags(): FeatureFlags {
  if (typeof window === 'undefined') {
    // Server-side rendering - return default flags
    return getFeatureFlags()
  }
  
  // Client-side - could add state management here if needed
  return getFeatureFlags()
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags()
  return flags[feature]
}

/**
 * Conditional feature wrapper
 * Use this to conditionally render components based on features
 */
export function withFeature<P extends object>(
  feature: keyof FeatureFlags | ((flags: FeatureFlags) => boolean),
  Component: React.ComponentType<P>,
  FallbackComponent?: React.ComponentType<P>
): React.ComponentType<P> {
  const WrappedComponent = (props: P) => {
    const flags = useFeatureFlags()
    
    const isEnabled = typeof feature === 'function' 
      ? feature(flags)
      : flags[feature]
    
    if (isEnabled) {
      return <Component {...props} />
    }
    
    if (FallbackComponent) {
      return <FallbackComponent {...props} />
    }
    
    return null
  }
  
  WrappedComponent.displayName = `withFeature(${Component.displayName || Component.name || 'Component'})`
  
  return WrappedComponent
}

/**
 * Development helpers
 */
export function logFeatureFlags(): void {
  if (process.env.NODE_ENV === 'development') {
    console.log('Feature Flags:', getFeatureFlags())
  }
}

/**
 * Testing helpers - override flags for testing
 */
let testOverrides: Partial<FeatureFlags> = {}

export function setTestFeatureFlags(overrides: Partial<FeatureFlags>): void {
  if (process.env.NODE_ENV === 'test') {
    testOverrides = overrides
  }
}

export function resetTestFeatureFlags(): void {
  testOverrides = {}
}

// Export types
export type { FeatureFlags }