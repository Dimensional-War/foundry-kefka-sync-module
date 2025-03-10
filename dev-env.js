(function () {
  const hmr = document.createElement("script");
  hmr.src = "/modules/kefka-sync/@vite/client";
  hmr.type = "module";
  document.head.prepend(hmr);

  const lib = document.createElement("script");
  lib.src = "/modules/kefka-sync/src/kefka-sync.js";
  lib.type = "module";
  document.head.appendChild(lib);
})();
