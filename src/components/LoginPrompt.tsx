import { LogIn, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type GatedAction = 'lend' | 'waitlist' | 'favourite' | 'request'

type PromptFn = (action: GatedAction) => void

const LoginPromptContext = createContext<PromptFn>(() => {})

export const useLoginPrompt = () => useContext(LoginPromptContext)

export function LoginPromptProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<GatedAction | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  const prompt = useCallback<PromptFn>((a) => setAction(a), [])
  const close = () => dialogRef.current?.close()

  useEffect(() => {
    const dialog = dialogRef.current
    if (action && dialog && !dialog.open) dialog.showModal()
  }, [action])

  return (
    <LoginPromptContext.Provider value={prompt}>
      {children}

      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="login-prompt-title"
        onClose={() => setAction(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close()
        }}
      >
        <div className="modal__content">
          <button className="modal__close" aria-label="Close" onClick={close}>
            <X size={20} />
          </button>
          <span className="modal__icon" aria-hidden="true">
            <LogIn size={24} />
          </span>
          <h2 id="login-prompt-title">You must be logged in to {action} an item</h2>
          <div className="modal__actions">
            <button className="btn btn--secondary" onClick={close}>
              Not now
            </button>
            <button className="btn btn--primary" onClick={close}>
              Sign in
            </button>
          </div>
        </div>
      </dialog>
    </LoginPromptContext.Provider>
  )
}
