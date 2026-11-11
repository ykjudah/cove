// electron-updater's UpdateCheckResult contains updateInfo, not an
// isUpdateAvailable boolean. Use its update-available event, which is emitted
// during checkForUpdates, to decide whether to verify and download.
async function checkForAvailableUpdate(updater) {
  let available = false;
  const markAvailable = () => { available = true; };
  updater.on('update-available', markAvailable);
  try {
    const result = await updater.checkForUpdates();
    return { result, available: Boolean(result && available) };
  } finally {
    updater.off('update-available', markAvailable);
  }
}
module.exports = { checkForAvailableUpdate };
