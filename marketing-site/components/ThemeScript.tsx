import { themeScript } from "@/lib/theme"

// TPC UI pre-paint + live-update script. Reads `tpc_theme` (then legacy
// `politogy_theme`), defaults to "system", and sets `.dark` before first paint.
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />
}
