"use client"

import { useState, useEffect, useRef } from "react"
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
  fullScreen?: boolean
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

// Group files by their parent directory (the part before the last /)
function groupByDir(files: TypstFile[]): Map<string, TypstFile[]> {
  const map = new Map<string, TypstFile[]>()
  for (const file of files) {
    const slash = file.relativePath.lastIndexOf("/")
    const dir = slash >= 0 ? file.relativePath.slice(0, slash) : ""
    if (!map.has(dir)) map.set(dir, [])
    map.get(dir)!.push(file)
  }
  return map
}

function TypstRenderPane({ content, key: _k }: { content: string; key: string }) {
  const [phase, setPhase] = useState<"waiting" | "compiling" | "done" | "error">("waiting")
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const didRun = useRef(false)

  useEffect(() => {
    if (didRun.current) return
    didRun.current = true

    const run = () => {
      setPhase("compiling")
      // @ts-expect-error - $typst is loaded via CDN
      window.$typst
        .svg({ mainContent: content })
        .then((result: string) => { setSvg(result); setPhase("done") })
        .catch((e: unknown) => {
          console.error("Typst render error:", e)
          setError(e instanceof Error ? e.message : String(e))
          setPhase("error")
        })
    }

    // @ts-expect-error
    if (window.$typst) {
      run()
      return
    }

    const existing = document.querySelector('script[src*="typst-all-in-one"]') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener("load", run, { once: true })
      return
    }

    const script = document.createElement("script")
    script.type = "module"
    script.src = "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-all-in-one.ts@0.6.0/dist/esm/index.js"
    script.onload = run
    document.head.appendChild(script)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === "waiting" || phase === "compiling") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground p-6">
        <div className="flex gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-pulse" />
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-pulse [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-foreground/30 animate-pulse [animation-delay:300ms]" />
        </div>
        <p className="text-xs italic text-center">
          Compiling… packages download on first run, may take ~30 s
        </p>
      </div>
    )
  }

  if (phase === "error") {
    return <p className="text-xs text-destructive font-mono break-all p-4">{error}</p>
  }

  return (
    <div
      className="overflow-auto p-4 [&_svg]:max-w-full [&_svg]:h-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export function TypstTempViewer({ files, basePath, fullScreen = false }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)
  const grouped = groupByDir(files)

  if (files.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No files uploaded.</p>
  }

  const active = files[activeIndex]
  const ext = extOf(active.name)
  const isTypst = ext === ".typ"
  const isImage = IMAGE_EXTS.has(ext)
  const downloadHref = `${basePath}/typst_temp/${active.relativePath.split("/").map(encodeURIComponent).join("/")}`

  return (
    <div className={fullScreen ? "flex gap-0 border-t border-border overflow-hidden h-full" : "flex gap-0 border border-border rounded-lg overflow-hidden min-h-[480px]"}>
      {/* File tree sidebar */}
      <aside className="w-52 shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
        {Array.from(grouped.entries()).map(([dir, dirFiles]) => (
          <div key={dir}>
            {dir && (
              <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground font-mono flex items-center gap-1">
                <span className="opacity-50">▸</span> {dir}
              </p>
            )}
            {dirFiles.map((file) => {
              const idx = files.indexOf(file)
              const isActive = idx === activeIndex
              return (
                <button
                  key={file.relativePath}
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 text-xs font-mono transition-colors flex items-center gap-1.5",
                    dir ? "pl-6" : "pl-3",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <span className="opacity-60">{extOf(file.name) === ".typ" ? "◈" : "◻"}</span>
                  <span className="truncate">{file.name}</span>
                  <span className="ml-auto shrink-0 opacity-40 text-[10px]">{formatSize(file.size)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </aside>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
          <p className="text-[11px] font-mono text-muted-foreground truncate">
            {active.relativePath}
          </p>
          <a href={downloadHref} download={active.name} className="shrink-0">
            <Button size="sm" variant="outline" className="text-xs h-7">
              Download
            </Button>
          </a>
        </div>

        {/* Split view */}
        {isTypst ? (
          <div className="flex-1 grid grid-cols-2 min-h-0 divide-x divide-border">
            <div className="overflow-auto">
              <pre className="p-4 text-xs font-mono whitespace-pre leading-relaxed text-foreground/90">
                {active.content}
              </pre>
            </div>
            <div className="flex flex-col min-h-0">
              <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground shrink-0">
                Preview
              </p>
              <div className="flex-1 overflow-auto">
                <TypstRenderPane key={active.relativePath} content={active.content} />
              </div>
            </div>
          </div>
        ) : isImage ? (
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={downloadHref}
              alt={active.name}
              className="max-w-full max-h-full object-contain"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <pre className="p-4 text-xs font-mono whitespace-pre leading-relaxed">
              {active.content}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}
