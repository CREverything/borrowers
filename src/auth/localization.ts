import type { ClerkProviderProps } from "@clerk/react";

/**
 * The app says "log in", not "sign in". These override every English Clerk
 * string that mentions signing in or out, in the screens people can reach:
 * login, sign-up, account settings, extra verification steps and errors.
 * Generated from @clerk/localizations (en-US); anything not listed keeps
 * Clerk's default text.
 */
export const clerkLocalization: ClerkProviderProps["localization"] = {
  signIn: {
    accountSwitcher: {
      action__signOutAll: "Log out of all accounts",
    },
    alternativeMethods: {
      blockButton__passkey: "Log in with your passkey",
      blockButton__password: "Log in with your password",
      getHelp: {
        content: "If you have trouble logging into your account, email us and we will work with you to restore access as soon as possible.",
      },
      subtitle: "Facing issues? You can use any of these methods to log in.",
    },
    emailLink: {
      clientMismatch: {
        subtitle: "To continue, open the verification link on the device and browser from which you initiated the login",
      },
      loading: {
        title: "Logging in...",
      },
      verified: {
        title: "Successfully logged in",
      },
      verifiedSwitchTab: {
        titleNewTab: "Logged in on other tab",
      },
    },
    forgotPasswordAlternativeMethods: {
      label__alternativeMethods: "Or, log in with another method",
    },
    newDeviceVerificationNotice: "You're logging in from a new device. We're asking for verification to keep your account secure.",
    noAvailableMethods: {
      message: "Cannot proceed with login. There's no available authentication factor.",
      title: "Cannot log in",
    },
    start: {
      alternativePhoneCodeProvider: {
        title: "Log in to {{applicationName}} with {{provider}}",
      },
      subtitle: "Welcome back! Please log in to continue",
      title: "Log in to {{applicationName}}",
    },
    web3Solana: {
      subtitle: "Select a wallet below to log in",
      title: "Log in with Solana",
    },
  },
  signUp: {
    continue: {
      actionLink: "Log in",
    },
    restrictedAccess: {
      actionLink: "Log in",
    },
    start: {
      actionLink: "Log in",
    },
  },
  userButton: {
    action__signOut: "Log out",
    action__signOutAll: "Log out of all accounts",
  },
  userProfile: {
    backupCodePage: {
      successMessage: "Backup codes are now enabled. You can use one of these to log in to your account, if you lose access to your authentication device. Each code can only be used once.",
      successSubtitle: "You can use one of these to log in to your account, if you lose access to your authentication device.",
    },
    emailAddressPage: {
      enterpriseSSOLink: {
        formButton: "Click to log in",
        formSubtitle: "Complete the login with {{identifier}}",
      },
      removeResource: {
        messageLine2: "You will no longer be able to log in using this email address.",
      },
    },
    mfaPhoneCodePage: {
      removeResource: {
        messageLine1: "{{identifier}} will be no longer receiving verification codes when logging in.",
      },
      successMessage1: "When logging in, you will need to enter a verification code sent to this phone number as an additional step.",
      successMessage2: "Save these backup codes and store them somewhere safe. If you lose access to your authentication device, you can use backup codes to log in.",
    },
    mfaTOTPPage: {
      authenticatorApp: {
        infoText__ableToScan: "Set up a new login method in your authenticator app and scan the following QR code to link it to your account.",
        infoText__unableToScan: "Set up a new login method in your authenticator and enter the Key provided below.",
      },
      removeResource: {
        messageLine1: "Verification codes from this authenticator will no longer be required when logging in.",
      },
      successMessage: "Two-step verification is now enabled. When logging in, you will need to enter a verification code from this authenticator as an additional step.",
    },
    passwordPage: {
      checkboxInfoText__signOutOfOtherSessions: "It is recommended to log out of all other devices which may have used your old password.",
      readonly: "Your password can currently not be edited because you can log in only via the enterprise connection.",
    },
    phoneNumberPage: {
      removeResource: {
        messageLine2: "You will no longer be able to log in using this phone number.",
      },
    },
    start: {
      activeDevicesSection: {
        destructiveAction: "Log out of device",
      },
    },
    web3WalletPage: {
      removeResource: {
        messageLine2: "You will no longer be able to log in using this web3 wallet.",
      },
    },
  },
  taskResetPassword: {
    signOut: {
      actionLink: "Log out",
      actionText: "Logged in as {{identifier}}",
    },
  },
  taskSetupMfa: {
    signOut: {
      actionLink: "Log out",
      actionText: "Logged in as {{identifier}}",
    },
    smsCode: {
      success: {
        message1: "Two-step verification is now enabled. When logging in, you will need to enter a verification code sent to this phone number as an additional step.",
        message2: "Save these backup codes and store them somewhere safe. If you lose access to your authentication device, you can use backup codes to log in.",
      },
    },
    totpCode: {
      addAuthenticatorApp: {
        infoText__ableToScan: "Set up a new login method in your authenticator app and scan the following QR code to link it to your account.",
        infoText__unableToScan: "Set up a new login method in your authenticator and enter the Key provided below.",
      },
      success: {
        message1: "Two-step verification is now enabled. When logging in, you will need to enter a verification code from this authenticator as an additional step.",
        message2: "Save these backup codes and store them somewhere safe. If you lose access to your authentication device, you can use backup codes to log in.",
      },
    },
  },
  unstable__errors: {
    external_account_not_found: "Account not found. Please sign up or try logging in to a different account.",
    form_password_untrusted__sign_in: "Your password may be compromised. To protect your account, please continue with an alternative login method. You will be required to reset your password after logging in.",
    protect_check_required: "This login needs an extra verification step that can't be shown here. Please try again or use a different login method.",
  },
  formFieldLabel__signOutOfOtherSessions: "Log out of all other devices",
};
