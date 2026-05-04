export const APP_ROUTES = {
  root: "/",
  connect: "/connect",
  login: "/login",
  logout: "/logout",
  accountAccess: "/account/access",
  admin: "/admin",
  server: "/server",
  downloadDataConnect: "/download-data-connect",
  deviceAuth: "/auth/device",
} as const;

export type AppRoutePath = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
