// Embedding support for stefanomorello.com/book-index.html.
// - The parent page sends {type: 'theme', theme: 'light'|'dark'} so the tool follows the site toggle.
// - The tool reports its height so the parent can size the iframe with no inner scrollbar.
(function () {
  var root = document.documentElement;
  var embedded = window.self !== window.top;
  var PARENTS = ['https://stefanomorello.com', 'https://www.stefanomorello.com'];

  if (!embedded) return;
  root.classList.add('embedded');

  window.addEventListener('message', function (e) {
    if (PARENTS.indexOf(e.origin) === -1 || !e.data || e.data.type !== 'theme') return;
    root.setAttribute('data-theme', e.data.theme === 'dark' ? 'dark' : 'light');
  });

  function send(message) {
    // Height and readiness are not sensitive, but only the site needs them.
    PARENTS.forEach(function (origin) {
      window.parent.postMessage(message, origin);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.querySelector('.page');
    var last = 0;
    function report() {
      var height = Math.ceil(page.getBoundingClientRect().height);
      if (height !== last) {
        last = height;
        send({ type: 'book-index:height', height: height });
      }
    }
    new ResizeObserver(report).observe(page);
    send({ type: 'book-index:ready' });
    report();
  });
})();
