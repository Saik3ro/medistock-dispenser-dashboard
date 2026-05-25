import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Loading fallback component
function LoadingFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="space-y-3 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Loading MediStock...</p>
      </div>
    </div>
  )
}

const root = ReactDOM.createRoot(document.getElementById('root'))

root.render(
  <React.StrictMode>
    <Suspense fallback={<LoadingFallback />}>
      <App />
    </Suspense>
  </React.StrictMode>,
)
