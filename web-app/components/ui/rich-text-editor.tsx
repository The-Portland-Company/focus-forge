"use client"

import { useEffect, type ReactNode } from "react"
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
  disabled = false,
}: RichTextEditorProps) {
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

  const setLink = () => {
    if (!editor) return

    const previousUrl = editor.getAttributes("link").href as string | undefined
    const url = window.prompt("Enter a URL", previousUrl || "https://")

    if (url === null) return
    if (url.trim() === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url.trim(), target: "_blank", rel: "noopener noreferrer" })
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
          onClick={setLink}
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

      <EditorContent editor={editor} />
    </div>
  )
}
