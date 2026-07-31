"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import Underline from "@tiptap/extension-underline"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Unlink,
  Code2,
} from "lucide-react"
import { sanitizeRichText } from "@/lib/rich-text-sanitize"
import { cn } from "@/lib/utils"

interface RichTextEditorProps {
  id?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  minHeightClassName?: string
  contentClassName?: string
  disabled?: boolean
}

interface ToolbarButtonProps {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: ReactNode
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border text-zinc-300 transition-colors",
        active
          ? "border-theme-primary/50 bg-theme-primary/15 text-white"
          : "border-zinc-700 bg-zinc-900 hover:border-zinc-500 hover:text-white",
        disabled && "cursor-not-allowed opacity-50",
      )}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  )
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = "Write something...",
  className,
  minHeightClassName = "min-h-[140px]",
  contentClassName,
  disabled = false,
}: RichTextEditorProps) {
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkValue, setLinkValue] = useState("")
  const linkInputRef = useRef<HTMLInputElement | null>(null)

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: sanitizeRichText(value),
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class: cn(
          "focus-forge-editor__input px-4 py-3 text-sm text-zinc-100 focus:outline-none",
          minHeightClassName,
        ),
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(sanitizeRichText(currentEditor.getHTML()))
    },
  })

  useEffect(() => {
    if (!editor) return
    const safeValue = sanitizeRichText(value)
    if (editor.getHTML() !== safeValue) {
      editor.commands.setContent(safeValue, { emitUpdate: false })
    }
    editor.setEditable(!disabled)
  }, [disabled, editor, value])

  useEffect(() => {
    if (!linkOpen) return
    const input = linkInputRef.current
    if (!input) return
    input.focus()
    input.select()
  }, [linkOpen])

  // Link editing uses an inline row rather than window.prompt: a native prompt
  // is swallowed inside the composer's modal (the dialog's focus trap reclaims
  // focus and the editor selection is gone by the time it returns), so the
  // Link button appeared to do nothing.
  const openLinkEditor = () => {
    if (!editor) return
    const previousUrl = editor.getAttributes("link").href as string | undefined
    setLinkValue(previousUrl || "https://")
    setLinkOpen(true)
  }

  const applyLink = () => {
    if (!editor) return
    const url = linkValue.trim()
    setLinkOpen(false)

    if (!url || url === "https://") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url, target: "_blank", rel: "noopener noreferrer" })
      .run()
  }

  if (!editor) {
    return (
      <div
        className={cn(
          "rounded-xl border border-zinc-700 bg-zinc-800/90",
          className,
        )}
      >
        <div className={cn("px-4 py-3 text-sm text-zinc-500", minHeightClassName)}>
          {placeholder}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "focus-forge-editor overflow-hidden rounded-xl border border-zinc-700 bg-zinc-800/90 shadow-inner",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-700 bg-zinc-950/60 px-3 py-2">
        <ToolbarButton
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Strike"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Bullet List"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Numbered List"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Inline Code"
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Add Link"
          active={editor.isActive("link")}
          onClick={openLinkEditor}
        >
          <LinkIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          label="Remove Link"
          disabled={!editor.isActive("link")}
          onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        >
          <Unlink className="h-4 w-4" />
        </ToolbarButton>
      </div>

      {linkOpen ? (
        <div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-950/40 px-3 py-2">
          <input
            ref={linkInputRef}
            type="url"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                applyLink()
              }
              if (event.key === "Escape") {
                event.preventDefault()
                setLinkOpen(false)
              }
            }}
            placeholder="https://example.com"
            aria-label="Link URL"
            className="h-8 min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-8 rounded-md bg-theme-gradient px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setLinkOpen(false)}
            className="h-8 rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : null}

      <EditorContent editor={editor} className={contentClassName} />
    </div>
  )
}
