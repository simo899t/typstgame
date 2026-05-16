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

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Simple Typst syntax highlighter using Typst's teal brand colour (#239DAD)
function highlightTypst(code: string): string {
  const out: string[] = []
  let i = 0
  let plain = ""

  const flush = () => { if (plain) { out.push(escHtml(plain)); plain = "" } }
  const span = (text: string, color: string) => {
    flush()
    out.push(`<span style="color:${color}">${escHtml(text)}</span>`)
  }

  while (i < code.length) {
    // Line comment //
    if (code[i] === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i)
      span(end === -1 ? code.slice(i) : code.slice(i, end), "#888")
      i = end === -1 ? code.length : end
      continue
    }
    // Block comment /* */
    if (code[i] === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2)
      span(end === -1 ? code.slice(i) : code.slice(i, end + 2), "#888")
      i = end === -1 ? code.length : end + 2
      continue
    }
    // String literal
    if (code[i] === '"') {
      let j = i + 1
      while (j < code.length && code[j] !== '"') { if (code[j] === "\\") j++; j++ }
      span(code.slice(i, j + 1), "#c97c2e")
      i = j + 1
      continue
    }
    // Math mode $...$
    if (code[i] === "$") {
      const end = code.indexOf("$", i + 1)
      if (end !== -1) { span(code.slice(i, end + 1), "#8b5cf6"); i = end + 1; continue }
    }
    // #function or #keyword
    if (code[i] === "#") {
      const m = code.slice(i).match(/^#[a-zA-Z_][a-zA-Z0-9_-]*/)
      if (m) { span(m[0], "#239DAD"); i += m[0].length; continue }
    }
    plain += code[i++]
  }
  flush()
  return out.join("")
}

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

function TypstRenderPane({ content, isTemplate, key: _k }: { content: string; isTemplate: boolean; key: string }) {
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
    return isTemplate ? (
      <p className="text-sm text-muted-foreground italic p-6 text-center">
        This is a template and is not made to compile on its own.
      </p>
    ) : (
      <p className="text-xs text-destructive font-mono break-all p-4">{error}</p>
    )
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
  const [splitPct, setSplitPct] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const grouped = groupByDir(files)

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const onMove = (mv: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const pct = ((mv.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.min(80, Math.max(20, pct)))
    }
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }
  // All folders open by default
  const [openDirs, setOpenDirs] = useState<Set<string>>(
    () => new Set(Array.from(groupByDir(files).keys()))
  )

  const toggleDir = (dir: string) =>
    setOpenDirs((prev) => {
      const next = new Set(prev)
      next.has(dir) ? next.delete(dir) : next.add(dir)
      return next
    })

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
        <div className="py-1">
          {Array.from(grouped.entries()).map(([dir, dirFiles]) => {
            const isOpen = !dir || openDirs.has(dir)
            return (
              <div key={dir}>
                {dir && (
                  <button
                    onClick={() => toggleDir(dir)}
                    className="w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <span className="text-[10px] transition-transform duration-150" style={{ display: "inline-block", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                    <span>{dir}</span>
                  </button>
                )}
                {isOpen && dirFiles.map((file) => {
                  const idx = files.indexOf(file)
                  const isActive = idx === activeIndex
                  return (
                    <button
                      key={file.relativePath}
                      onClick={() => setActiveIndex(idx)}
                      className={cn(
                        "w-full text-left py-1.5 text-xs font-mono transition-colors flex items-center gap-1.5",
                        dir ? "pl-7 pr-3" : "px-3",
                        isActive
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      )}
                    >
                      <span className="opacity-60 shrink-0">{extOf(file.name) === ".typ" ? "◈" : "◻"}</span>
                      <span className="truncate">{file.name}</span>
                      <span className="ml-auto shrink-0 opacity-40 text-[10px]">{formatSize(file.size)}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
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
          <div ref={containerRef} className="flex-1 flex min-h-0 select-none">
            {/* Code pane */}
            <div className="overflow-auto" style={{ width: `${splitPct}%` }}>
              <pre
                className="p-4 text-xs font-mono whitespace-pre leading-relaxed"
                dangerouslySetInnerHTML={{ __html: highlightTypst(active.content) }}
              />
            </div>
            {/* Drag handle */}
            <div
              onMouseDown={startDrag}
              className="w-1 shrink-0 bg-border hover:bg-foreground/30 cursor-col-resize transition-colors"
            />
            {/* Preview pane */}
            <div className="flex flex-col min-h-0 overflow-auto" style={{ width: `${100 - splitPct}%` }}>
              <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground shrink-0">
                Preview
              </p>
              <div className="flex-1">
                <TypstRenderPane
                  key={active.relativePath}
                  content={active.content}
                  isTemplate={active.name === "temp.typ"}
                />
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
