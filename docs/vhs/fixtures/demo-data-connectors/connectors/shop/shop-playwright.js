(async () => {
  await page.showBrowser("https://shop.app/account/order-history");
  await page.promptUser(
    "Finish signing in to Shop in the browser window.",
    async () => false,
    1,
  );
})();
