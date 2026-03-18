const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  await page.setData("status", "Checking GitHub login...");

  if (process.env.VANA_DEMO_FAST_SUCCESS !== "1") {
    await page.requestInput({
      message: "Log in to GitHub",
      schema: {
        type: "object",
        properties: {
          username: { type: "string" },
          password: { type: "string", format: "password" },
        },
      },
    });
  }

  const demoDelay = process.env.VANA_DEMO_FAST_SUCCESS === "1" ? 800 : 120;
  await delay(demoDelay);
  await page.setData(
    "status",
    "Login confirmed. Collecting data in background...",
  );
  await page.setProgress({
    phase: { step: 1, total: 3, label: "Profile" },
    message: "Fetching profile...",
  });
  await delay(demoDelay);
  await page.setProgress({
    phase: { step: 2, total: 3, label: "Repositories" },
    message: "Fetched 2 repositories",
    count: 2,
  });
  await delay(demoDelay);
  await page.setProgress({
    phase: { step: 3, total: 3, label: "Starred" },
    message: "Fetched 0 starred repositories",
    count: 0,
  });
  await delay(demoDelay);

  return {
    profile: { username: "tnunamak" },
    repositories: [{ name: "vana-connect" }, { name: "data-connectors" }],
    starred: [],
    exportSummary: {
      count: 2,
      label: "items",
      details: "2 repositories, 0 starred",
    },
  };
})();
