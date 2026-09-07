"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  ModalMinimizeButton,
  ModalResizeHandle,
  useModalWindow,
} from "@/components/ui/modal-window"

/**
 * Dialog root. Every dialog in the app is draggable by its top strip and can be
 * minimized into the shared dock (see components/ui/modal-window).
 */
const Dialog = DialogPrimitive.Root

/**
 * While a dialog is minimized the page must go back to being usable, but Radix's
 * modal mode parks `pointer-events: none` on the body and locks scrolling.
 * Toggling Radix's own `modal` prop would do it — at the cost of remounting the
 * content and wiping whatever the user had typed. So the two body-level effects
 * are lifted here instead, and reinstated on restore. The dialog element itself
 * is never recreated.
 */
function useBodyInteractivityWhileMinimized(minimized: boolean) {
  React.useEffect(() => {
    if (!minimized) return
    const { body } = document
    const previousPointerEvents = body.style.pointerEvents
    const previousOverflow = body.style.overflow
    body.style.pointerEvents = "auto"
    body.style.overflow = ""
    return () => {
      body.style.pointerEvents = previousPointerEvents
      body.style.overflow = previousOverflow
    }
  }, [minimized])
}

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Label used in the minimized dock; falls back to "Window". */
    windowTitle?: string
    /** Opt out of minimize (confirmations, alerts). */
    minimizable?: boolean
    /** Lets the dock close this dialog without restoring it first. Omit when
     *  closing is only meaningful from inside the dialog. */
    onRequestClose?: () => void
  }
>((
  { className, children, windowTitle, minimizable = true, onRequestClose, ...props },
  ref,
) => {
  const {
    minimized,
    minimize,
    dragHandleProps,
    centeredPanelStyle,
    panelRef,
    resizeHandleProps,
    sizeStyle,
  } = useModalWindow({
    title: windowTitle || "Window",
    minimizable,
    onRequestClose,
  })

  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      panelRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node
    },
    [panelRef, ref],
  )

  useBodyInteractivityWhileMinimized(minimized)

  return (
    <DialogPortal>
      {minimized ? null : <DialogOverlay />}
      <DialogPrimitive.Content
        ref={mergedRef}
        className={cn(
          // Mobile-first: a near-full-screen sheet that fills the small-phone
          // viewport (with a small inset + safe-area padding) and scrolls its
          // own body. At sm+ it collapses back to the classic centered dialog
          // with the existing max width. Callers can still override either via
          // className (merged last, so their max-w-* / width wins).
          "fixed left-[50%] top-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          // Base (small phones): full-width sheet, capped height, internal scroll,
          // safe-area-aware bottom padding so footers stay reachable above the
          // home indicator / browser chrome.
          "max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]",
          // sm+ : classic centered dialog with the original max width + padding.
          "sm:max-h-[85vh] sm:w-full sm:max-w-lg sm:rounded-lg sm:p-6 sm:pb-6",
          minimized && "pointer-events-none invisible",
          className
        )}
        style={{
          ...centeredPanelStyle,
          ...sizeStyle,
          overflow: sizeStyle.width ? "auto" : undefined,
          ...(minimized ? { display: "none" } : null),
          ...(props.style || {}),
        }}
        {...props}
        // While minimized the dialog is non-modal, so Radix would treat a click
        // on the dock (or anywhere else) as an outside-dismiss and close it.
        // Suppress dismissal until it is restored.
        onPointerDownOutside={(event) => {
          if (minimized) event.preventDefault()
          props.onPointerDownOutside?.(event)
        }}
        onInteractOutside={(event) => {
          if (minimized) event.preventDefault()
          props.onInteractOutside?.(event)
        }}
        onFocusOutside={(event) => {
          if (minimized) event.preventDefault()
          props.onFocusOutside?.(event)
        }}
        onEscapeKeyDown={(event) => {
          if (minimized) event.preventDefault()
          props.onEscapeKeyDown?.(event)
        }}
      >
        {/* Drag strip across the header area. It sits behind the content so
            titles and buttons keep working; only empty header space grabs. */}
        <div
          {...dragHandleProps}
          aria-hidden
          className="absolute inset-x-0 top-0 z-0 h-12 rounded-t-lg"
        />
        {children}
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          {minimizable ? <ModalMinimizeButton onMinimize={minimize} /> : null}
          <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </div>
        {minimized ? null : <ModalResizeHandle handleProps={resizeHandleProps} />}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
