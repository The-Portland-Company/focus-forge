export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Test Page</h1>
        <p className="text-xl">If you see this, the Next.js app is working!</p>
        <div className="mt-8 text-sm text-gray-400">
          <p>Environment: {process.env.NODE_ENV}</p>
          <p>Port: {process.env.PORT || '3244'}</p>
        </div>
      </div>
    </div>
  )
}