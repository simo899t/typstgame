"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type TypstFile = {
  name: string
  size: number
  content: string
  relativePath: string
}

type Props = {
  files: TypstFile[]
  basePath: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(i).toLowerCase() : ""
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"])

export function TypstTempViewer({ files, basePath }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [typstReady, setTypstReady] = useState(false)
  const [renderedSvg, setRenderedSvg] = useState("")
  const [renderError, setRenderError] = useState<string | null>(null)

  useEffect(() => {
    const script = document.createElement("script")
    script.type = "module"
    script.src = "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-all-in-one.ts@0.6.0/dist/esm/index.js"
    script.onload = () => setTypstReady(true)
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const active = files[activeIndex]
  const ext = active ? extOf(active.name) : ""
  const isTypst = ext === ".typ"
  const isImage = IMAGE_EXTS.has(ext)

  useEffect(() => {
    if (!isTypst || !typstReady || !active) {
      setRenderedSvg("")
      setRenderError(null)
      return
    }
    setRenderedSvg("")
    setRenderError(null)
    // @ts-expect-error - $typst is loaded via CDN
    window.$typst.svg({ mainContent: active.content })
      .then((svg: string) => { setRenderedSvg(svg) })
      .catch((e: unknown) => {
        console.error("Typst viewer render error:", e)
        setRenderError(e instanceof Error ? e.message : String(e))
      })
  }, [activeIndex, isTypst, typstReady])

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No files uploaded.</p>
    )
  }

  const downloadHref = `${basePath}/typst_temp/${active.relativePath.split("/").map(encodeURIComponent).join("/")}`

  return (
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      <ul className="space-y-1">
        {files.map((file, idx) => (
          <li key={file.relativePath}>
            <button
              onClick={() => setActiveIndex(idx)}
              className={cn(
                "w-full text-left px-3 py-2 rounded-md text-sm font-mono transition-colors flex flex-col gap-0.5",
                idx === activeIndex
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted/50"
              )}
            >
              <span className="truncate">{file.name}</span>
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  idx === activeIndex ? "text-background/60" : "text-muted-foreground/60"
                )}
              >
                {formatSize(file.size)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="space-y-3 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground font-mono truncate">
            {active.relativePath}
          </p>
          <a href={downloadHref} download={active.name} className="shrink-0">
            <Button size="sm" variant="outline" className="text-xs">
              Download
            </Button>
          </a>
        </div>

        {isTypst ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <pre className="bg-muted/40 border border-border rounded-md p-4 text-xs font-mono overflow-auto max-h-[520px] whitespace-pre">
              {active.content}
            </pre>
            <div className="bg-card border border-border rounded-md p-4 flex flex-col gap-2 min-h-[200px] overflow-auto max-h-[520px]">
              <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                {typstReady ? "Rendered" : "Loading Typst…"}
              </p>
              {renderedSvg ? (
                <div
                  className="[&_svg]:max-w-full [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: renderedSvg }}
                />
              ) : renderError ? (
                <p className="text-xs text-destructive font-mono break-all">{renderError}</p>
              ) : typstReady ? (
                <p className="text-xs text-muted-foreground italic">Rendering…</p>
              ) : null}
            </div>
          </div>
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={downloadHref}
            alt={active.name}
            className="max-w-full rounded-md border border-border"
          />
        ) : (
          <pre className="bg-muted/40 border border-border rounded-md p-4 text-xs font-mono overflow-auto max-h-[420px] whitespace-pre">
            {active.content}
          </pre>
        )}
      </div>
    </div>
  )
}
