// S-5 probe script. It exists so the asset set contains a script file as well
// as markup and styles, and so the upload manifest is not trivially uniform.
// It deliberately contains no numeric literal: the repository-wide ceiling
// scan walks this directory, and a probe asset must not be mistaken for a
// place where a free-tier budget number could hide.
document.documentElement.setAttribute('data-probe', 's-5');
