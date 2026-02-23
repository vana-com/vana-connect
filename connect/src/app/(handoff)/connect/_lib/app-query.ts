type SearchParamReader = Pick<URLSearchParams, "get">;

export function resolveConnectAppRef(
  searchParams: SearchParamReader,
): string | null {
  return (
    searchParams.get("app") ||
    searchParams.get("appId") ||
    searchParams.get("appName")
  );
}
