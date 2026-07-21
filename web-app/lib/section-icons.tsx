import {
  Archive,
  Bomb,
  Bug,
  Calendar,
  CheckSquare,
  FileText,
  FlaskConical,
  Flag,
  Folder,
  FolderTree,
  Hash,
  Inbox,
  Lightbulb,
  Rocket,
  Star,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export interface SectionIconOption {
  key: string
  label: string
  Icon: LucideIcon
}

/**
 * Canonical icon set shared by sections and task lists. Keys are stored in
 * `sections.icon` (text); the sidebar draws from the same lucide vocabulary.
 */
export const SECTION_ICONS: SectionIconOption[] = [
  { key: 'folder', label: 'Folder', Icon: Folder },
  { key: 'folder-tree', label: 'Folder Tree', Icon: FolderTree },
  { key: 'check-square', label: 'Checklist', Icon: CheckSquare },
  { key: 'hash', label: 'Hash', Icon: Hash },
  { key: 'star', label: 'Star', Icon: Star },
  { key: 'target', label: 'Target', Icon: Target },
  { key: 'flag', label: 'Flag', Icon: Flag },
  { key: 'calendar', label: 'Calendar', Icon: Calendar },
  { key: 'inbox', label: 'Inbox', Icon: Inbox },
  { key: 'file-text', label: 'Document', Icon: FileText },
  { key: 'archive', label: 'Archive', Icon: Archive },
  { key: 'lightbulb', label: 'Idea', Icon: Lightbulb },
  { key: 'zap', label: 'Lightning', Icon: Zap },
  { key: 'rocket', label: 'Rocket', Icon: Rocket },
  { key: 'flask', label: 'Experiment', Icon: FlaskConical },
  { key: 'bomb', label: 'Bomb', Icon: Bomb },
  { key: 'bug', label: 'Bug', Icon: Bug },
  { key: 'trophy', label: 'Trophy', Icon: Trophy },
]

export const DEFAULT_SECTION_ICON_KEY = 'folder'

const ICONS_BY_KEY = new Map(SECTION_ICONS.map((opt) => [opt.key, opt]))

/** Sections created before the lucide registry stored emoji in `icon`. */
const LEGACY_EMOJI_KEYS: Record<string, string> = {
  '📁': 'folder',
  '📋': 'check-square',
  '🎯': 'target',
  '💡': 'lightbulb',
  '⚡': 'zap',
  '🔥': 'flag',
  '💎': 'star',
  '🚀': 'rocket',
  '⭐': 'star',
  '🏆': 'trophy',
}

/** Resolves a stored icon value (key or legacy emoji) to a registry key. */
export function resolveSectionIconKey(icon?: string | null): string {
  if (!icon) return DEFAULT_SECTION_ICON_KEY
  if (ICONS_BY_KEY.has(icon)) return icon
  return LEGACY_EMOJI_KEYS[icon] ?? DEFAULT_SECTION_ICON_KEY
}

/** Resolves a stored icon value to its lucide component, falling back to Folder. */
export function getSectionIcon(icon?: string | null): LucideIcon {
  return ICONS_BY_KEY.get(resolveSectionIconKey(icon))?.Icon ?? Folder
}
