"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type TypstFile = {
  name: string
  size: number
  content: string
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

export function TypstTempViewer({ files, basePath }: Props) {
  const [activeIndex, setActiveIndex] = useState(0)

  if (files.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No files yet. Drop files into <code className="font-mono">public/typst_temp/</code> and rebuild.
      </p>
    )
  }

  const active = files[activeIndex]
  const downloadHref = `${basePath}/typst_temp/${encodeURIComponent(active.name)}`

  return (
    <div className="grid gap-4 md:grid-cols-[200px_1fr]">
      <ul className="space-y-1">
        {files.map((file, idx) => (
          <li key={file.name}>
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
            {active.name}
          </p>
          <a
            href={downloadHref}
            download={active.name}
            className="shrink-0"
          >
            <Button size="sm" variant="outline" className="text-xs">
              Download
            </Button>
          </a>
        </div>
        <pre className="bg-muted/40 border border-border rounded-md p-4 text-xs font-mono overflow-auto max-h-[420px] whitespace-pre">
          {active.content}
        </pre>
      </div>
    </div>
  )
}
