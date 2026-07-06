/* forma-loader.js — carga el namespace window.Forma.
   1) Si existe _ds_bundle.js (generado por el compilador del design system), lo usa.
   2) Si no, construye los componentes directamente desde los .jsx (que usan solo React.createElement). */
(function () {
  function xhr(url) {
    try {
      var r = new XMLHttpRequest();
      r.open('GET', url, false);
      r.send();
      return r.status >= 200 && r.status < 300 ? r.responseText : null;
    } catch (e) { return null; }
  }
  var base = document.currentScript.src.replace(/[^/]*$/, ''); // …/components/
  var bundle = xhr(base + '../_ds_bundle.js');
  if (bundle) { try { (0, eval)(bundle); } catch (e) { /* ignore */ } }
  // Busca el namespace del bundle en nombres candidatos (nunca enumerar window: lanza SecurityError)
  var candidates = ['Forma', 'forma', 'FormaDS', 'DS', 'DesignSystem'];
  for (var i = 0; i < candidates.length; i++) {
    var v;
    try { v = window[candidates[i]]; } catch (e) { v = null; }
    if (v && typeof v === 'object' && v.Button && v.ProjectCard) { window.Forma = v; return; }
  }
  var files = ['core/Tag.jsx', 'core/Button.jsx', 'core/Input.jsx', 'core/Checkbox.jsx', 'core/Switch.jsx', 'content/Meta.jsx', 'content/ProjectCard.jsx'];
  var code = files.map(function (f) { return xhr(base + f) || ''; }).join('\n');
  code = code.replace(/^import .*$/gm, '').replace(/^export /gm, '');
  try {
    window.Forma = new Function(code + '\nreturn { Button: Button, Tag: Tag, Input: Input, Checkbox: Checkbox, Switch: Switch, Meta: Meta, ProjectCard: ProjectCard };')();
  } catch (e) {
    console.error('forma-loader: no se pudieron construir los componentes', e);
  }
})();
