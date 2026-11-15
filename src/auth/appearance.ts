import type { ClerkProviderProps } from "@clerk/react";

type Appearance = NonNullable<ClerkProviderProps["appearance"]>;
type Elements = NonNullable<Appearance["elements"]>;

/**
 * Makes Clerk's components look like the rest of the app.
 *
 * Clerk's own CSS goes into the "clerk" cascade layer, so the app's
 * (unlayered) styles in index.css always win. That lets Clerk's parts reuse
 * the app's classes: primary and secondary buttons, tags, form fields and
 * labels. The `clerk-*` rules in index.css cover the pieces with no app
 * equivalent.
 */

/** Shared by every Clerk component. */
const sharedElements: Elements = {
  headerTitle: "clerk-title",
  headerSubtitle: "clerk-subtitle",
  buttonArrowIcon: "clerk-hidden",
  dividerLine: "clerk-divider-line",
  dividerText: "clerk-divider-text",
  formFieldLabel: "field__label",
  formFieldInput: "clerk-input",
  otpCodeFieldInput: "clerk-input clerk-otp",
  formFieldAction: "clerk-link",
  identityPreviewEditButton: "clerk-link",
  backLink: "clerk-link",
  footerActionText: "clerk-footer-text",
  footerActionLink: "clerk-link",
};

/** The login and sign-up cards on /login and /signup. */
const authCardElements: Elements = {
  rootBox: "clerk-root",
  cardBox: "clerk-card-box",
  card: "clerk-card",
  footer: "clerk-footer",
  socialButtonsBlockButton: "btn btn--secondary btn--block clerk-btn",
  socialButtonsBlockButtonText: "clerk-inherit",
  alternativeMethodsBlockButton: "btn btn--secondary btn--block clerk-btn",
  formButtonPrimary: "btn btn--primary btn--block clerk-btn",
  formButtonReset: "btn btn--secondary btn--block clerk-btn",
};

/** The "Manage account" modal opened from the profile page. */
const accountModalElements: Elements = {
  modalContent: "clerk-modal",
  modalCloseButton: "clerk-close",
  cardBox: "clerk-account-box",
  navbar: "clerk-account-nav",
  navbarButton: "clerk-account-nav-btn",
  navbarButtonIcon: "clerk-account-nav-icon",
  navbarMobileMenuButton: "btn btn--secondary btn--sm",
  pageScrollBox: "clerk-account-page",
  profileSection: "clerk-account-section",
  profileSectionTitleText: "clerk-section-title",
  profileSectionPrimaryButton: "btn btn--ghost btn--sm clerk-ghost-btn",
  badge: "tag clerk-badge",
  menuButton: "icon-btn",
  menuList: "clerk-menu",
  menuItem: "clerk-menu-item",
  avatarImageActionsUpload: "btn btn--secondary btn--sm",
  formButtonPrimary: "btn btn--primary btn--sm clerk-compact-btn",
  formButtonReset: "btn btn--secondary btn--sm clerk-compact-btn",
  socialButtonsBlockButton: "btn btn--secondary btn--block clerk-btn",
  socialButtonsBlockButtonText: "clerk-inherit",
};

export const clerkAppearance: Appearance = {
  cssLayerName: "clerk",
  variables: {
    colorPrimary: "#f4d06f",
    colorPrimaryForeground: "#221b38",
    colorForeground: "#221b38",
    colorMutedForeground: "#5f5880",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#221b38",
    colorBorder: "#ebe3d9",
    colorDanger: "#b4371f",
    colorSuccess: "#2e8a57",
    colorRing: "#ff8811",
    colorModalBackdrop: "rgba(34, 27, 56, 0.45)",
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    fontFamilyButtons: "'Inter', system-ui, -apple-system, sans-serif",
    borderRadius: "10px",
  },
  elements: sharedElements,
  signIn: { elements: authCardElements },
  signUp: { elements: authCardElements },
  userProfile: { elements: accountModalElements },
};
