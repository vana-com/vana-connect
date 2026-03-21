export const APP_ROUTES = {
  root: "/",
  connect: "/connect",
  login: "/login",
  logout: "/logout",
  admin: "/admin",
  server: "/server",
  downloadDataConnect: "/download-data-connect",
} as const;

export type AppRoutePath = (typeof APP_ROUTES)[keyof typeof APP_ROUTES];
