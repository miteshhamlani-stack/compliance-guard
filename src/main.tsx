import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PortalHome } from './pages/PortalHome'
import { AuthProvider } from './context/AuthContext'
import { DocumentReconcilerWorkbench } from './modules/document-reconciler/DocumentReconcilerWorkbench'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      {window.location.pathname === '/'
        ? <PortalHome />
        : window.location.pathname === '/document-reconciler'
          ? <DocumentReconcilerWorkbench />
          : <App />}
    </AuthProvider>
  </StrictMode>,
)
