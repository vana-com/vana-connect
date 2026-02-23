type SearchParamReader = Pick<URLSearchParams, "get">;

export type ConnectAppQuery = {
  appUrl: string | null;
  appName: string | null;
};

export function resolveConnectAppQuery(
  searchParams: SearchParamReader,
): ConnectAppQuery {
  return {
    appUrl: searchParams.get("appUrl"),
    appName: searchParams.get("appName"),
  };
}
