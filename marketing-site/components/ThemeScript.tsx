// Inline, render-blocking script that sets the theme class before paint to
// avoid a flash. Defaults to dark (the app is dark-first), but respects a
// stored choice or the OS preference.
export function ThemeScript() {
  const code = `(function(){try{var s=localStorage.getItem('ff-theme');var d=s?s==='dark':!window.matchMedia('(prefers-color-scheme: light)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){document.documentElement.classList.add('dark');}})();`
  return <script dangerouslySetInnerHTML={{ __html: code }} />
}
