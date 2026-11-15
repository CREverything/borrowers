import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { LoginPromptProvider } from "./components/LoginPrompt";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <LoginPromptProvider>
        <App />
      </LoginPromptProvider>
    </AuthProvider>
  </StrictMode>,
);
