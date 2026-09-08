/* Dev loader: fetches component .jsx files, strips ES import/export, transpiles with Babel standalone and exposes them on window.AtlasMenna. The compiled _ds_bundle.js supersedes this when available. */
(function(){
  window.AtlasMenna = window.AtlasMenna || {};
  window.loadDS = async function(paths){
    for (const p of paths) {
      const src = await (await fetch(p)).text();
      const names = [...src.matchAll(/^export\s+(?:function|const|class)\s+([A-Za-z0-9_]+)/gm)].map(m => m[1]);
      const code = src.replace(/^\s*import[^;]*;\s*$/gm, '').replace(/^export\s+/gm, '')
        + '\n' + names.map(n => 'window.AtlasMenna.' + n + ' = ' + n + ';').join('\n');
      (0, eval)(Babel.transform(code, { presets: ['react'], filename: p }).code);
    }
    return window.AtlasMenna;
  };
})();