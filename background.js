// Listen for extension installation or update
browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Open options page when extension is newly installed
    browser.runtime.openOptionsPage();
  }
  // Optionally, you can also open on update:
  // else if (details.reason === 'update') {
  //   browser.runtime.openOptionsPage();
  // }
});
