/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Clerk publishable key (pk_...). Safe for the browser; never put the secret key in a VITE_ variable. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
