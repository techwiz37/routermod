(function () {
  var doc = document;
  var root = doc.documentElement;
  var FAMILY = 'Material Symbols Outlined';
  var SPEC = '24px "' + FAMILY + '"';

  function show() {
    root.classList.add('fonts-loaded');
  }

  // The icon font is a few MB and is often still downloading on mobile. Never
  // reveal glyphs on a wall-clock timer alone - that is what flashes raw words
  // like "automation"/"error_outline" over the UI. Wait until the actual
  // FontFace reports `loaded`, then reveal once.
  function iconFontReady() {
    if (!doc.fonts || !doc.fonts.forEach) return false;
    var found = false;
    var ready = true;
    doc.fonts.forEach(function (face) {
      var family = String(face.family || '').replace(/["']/g, '').trim();
      if (family === FAMILY) {
        found = true;
        if (face.status !== 'loaded') ready = false;
      }
    });
    return found && ready;
  }

  if (!doc.fonts || !doc.fonts.load) {
    show();
    return;
  }

  function attempt(remaining) {
    doc.fonts.load(SPEC, 'home automation tune error_outline schedule')
      .then(function () {
        if (iconFontReady()) {
          show();
        } else if (remaining > 0) {
          setTimeout(function () { attempt(remaining - 1); }, 250);
        } else {
          show(); // never leave icons invisible forever
        }
      })
      .catch(function () {
        if (remaining > 0) {
          setTimeout(function () { attempt(remaining - 1); }, 250);
        } else {
          show();
        }
      });
  }

  attempt(80); // up to ~20s of polling for slow mobile connections
  setTimeout(show, 30000); // absolute safety net
})();
