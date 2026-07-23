const base = require("./app.config.json");

// @rnmapbox/maps needs a Mapbox *secret* downloads token (sk.*, from
// https://account.mapbox.com/access-tokens/, with the "Downloads:Read" scope)
// at prebuild time to fetch the native SDK. It must never be committed, so it's
// injected here from the environment (set MAPBOX_DOWNLOADS_TOKEN before
// `expo prebuild` / `eas build`).
const downloadsToken = process.env.MAPBOX_DOWNLOADS_TOKEN || "";

module.exports = ({ config }) => {
  const expo = { ...base.expo, ...config };
  expo.plugins = expo.plugins.map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === "@rnmapbox/maps") {
      return [plugin[0], { ...plugin[1], RNMapboxMapsDownloadToken: downloadsToken }];
    }
    return plugin;
  });
  return expo;
};
