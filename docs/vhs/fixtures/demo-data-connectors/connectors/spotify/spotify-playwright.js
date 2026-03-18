(async () => {
  await page.requestInput({
    message: "Connect Spotify",
    schema: {
      type: "object",
      properties: {
        email: { type: "string" },
      },
    },
  });

  return {
    profile: { username: "tnunamak" },
    playlists: [{ name: "Data Portability" }, { name: "Build Flow" }],
  };
})();
