import { Auth } from "@follow/shared/auth"
import { DEV, IN_ELECTRON } from "@follow/shared/constants"
import { env } from "@follow/shared/env.desktop"
import { createDesktopAPIHeaders } from "@follow/utils/headers"
import PKG from "@pkg"

import { ipcServices } from "./client"
import { getAuthSessionToken } from "./client-session"

const headers = createDesktopAPIHeaders({ version: PKG.version })

const auth = new Auth({
  apiURL: env.VITE_API_URL,
  webURL: env.VITE_WEB_URL,
  fetchOptions: {
    headers,
    onRequest: (context) => {
      const authSessionToken = IN_ELECTRON ? getAuthSessionToken() : null
      if (authSessionToken) {
        context.headers.set(
          "Cookie",
          `__Secure-better-auth.session_token=${authSessionToken}; better-auth.session_token=${authSessionToken}`,
        )
      }
    },
  },
})

export const { authClient } = auth

// @keep-sorted
export const {
  changeEmail,
  changePassword,
  deleteUserCustom,
  getAccountInfo,
  getProviders,
  getSession,
  linkSocial,
  listAccounts,
  oneTimeToken,
  resetPassword,
  sendVerificationEmail,
  signIn,
  signOut,
  signUp,
  subscription,
  twoFactor,
  unlinkAccount,
  updateUser,
} = auth.authClient

export const forgetPassword = auth.authClient.requestPasswordReset

export const loginHandler: typeof auth.loginHandler = async (provider, runtime, args) => {
  if (
    IN_ELECTRON &&
    DEV &&
    runtime === "app" &&
    provider !== "credential" &&
    provider !== "magicLink" &&
    ipcServices?.auth.signInWithSocial
  ) {
    await ipcServices.auth.signInWithSocial(provider)
    return
  }

  return auth.loginHandler(provider, runtime, args)
}
