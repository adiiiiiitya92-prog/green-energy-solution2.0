import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auto-recover only in production when a new version is deployed and a chunk is requested
if (!import.meta.env.DEV) {
  window.addEventListener('vite:preloadError', () => {
    const reloadKey = 'ges_preload_reload_' + window.location.pathname;
    if (!sessionStorage.getItem(reloadKey)) {
      sessionStorage.setItem(reloadKey, '1');
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

