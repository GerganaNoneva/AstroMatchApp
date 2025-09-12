// credits-auto-loader.js — drop-in loader for pages you haven't edited yet
(function(){
  // If astro-credits is already present, do nothing
  if (document.querySelector('script[src*="astro-credits.js"]')) return;

  // Ensure firebase-init.js is loaded (if missing)
  const needFirebaseInit = !document.querySelector('script[src*="firebase-init.js"]');

  function appendModule(src){
    const s = document.createElement('script');
    s.type = 'module';
    s.src = src;
    document.body.appendChild(s);
  }

  function onReady(fn){
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once:true });
    else fn();
  }

  onReady(function(){
    if (needFirebaseInit) appendModule('firebase-init.js');
    appendModule('astro-credits.js?v=1');
  });
})();
