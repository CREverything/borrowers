import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LoginPromptProvider } from './components/LoginPrompt'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LoginPromptProvider>
      <App />
    </LoginPromptProvider>
  </StrictMode>,
)
