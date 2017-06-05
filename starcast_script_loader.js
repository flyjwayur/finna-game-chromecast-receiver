/**
 * Loads scripts in order and appends timestamp GET parameter to prevent the
 * browser from caching them. This is only meant for development builds, not
 * production.
 * @param {!Array.<string>} paths The paths to the js files to load.
 */
function loadScriptsNoCache(paths) {
  if (paths.length == 0) {
    return;
  }

  // Load the first path in the array, shift it, and call loadScriptsNoCache
  // again with the shifted path array when the script loads.
  var fileRef = document.createElement('script');
  fileRef.setAttribute('type', 'text/javascript');
  fileRef.setAttribute('src', paths.shift() + '?ts=' + Date.now());
  fileRef.onload = function() {
    loadScriptsNoCache(paths);
  };

  document.getElementsByTagName('head')[0].appendChild(fileRef);
}


loadScriptsNoCache([
  'pixi.js',
  'jquery-3.2.1.min.js',
  // Make sure cast receiver SDK is loaded before games receiver SDK.
  'https://www.gstatic.com/cast/sdk/libs/receiver/2.0.0/cast_receiver.js',
  'https://www.gstatic.com/cast/sdk/libs/games/1.0.0/cast_games_receiver.js',
  "https://code.createjs.com/tweenjs-0.6.2.min.js",
  'starcast_main.js',
  'starcast_game.js'
]);
