import fs from "node:fs"
import path from "node:path"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TypstTempViewer, type TypstFile } from "@/components/typst-temp-viewer"

const VIEWABLE_EXTENSIONS = new Set([
  ".typ", ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".tex", ".bib",
])
const MAX_INLINE_BYTES = 256 * 1024

function collectFiles(rootDir: string, dir: string): TypstFile[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: TypstFile[] = []

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) { files.push(...collectFiles(rootDir, full)); continue }
    if (!entry.isFile()) continue

    const stat = fs.statSync(full)
    const ext = path.extname(entry.name).toLowerCase()
    const relativePath = path.relative(rootDir, full).split(path.sep).join("/")
    const isViewable = VIEWABLE_EXTENSIONS.has(ext) && stat.size <= MAX_INLINE_BYTES
    const content = isViewable
      ? fs.readFileSync(full, "utf8")
      : `[Binary or large file (${stat.size} bytes). Download to view.]`
    const pdfName = entry.name.replace(/\.[^.]+$/, ".pdf")
    const pdfFull = path.join(dir, pdfName)
    const pdfRelativePath = pdfName !== entry.name && fs.existsSync(pdfFull)
      ? path.relative(rootDir, pdfFull).split(path.sep).join("/")
      : undefined
    files.push({ name: entry.name, size: stat.size, content, relativePath, pdfRelativePath })
  }

  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

export default function TemplatePage() {
  const rootDir = path.join(process.cwd(), "public", "typst_temp")
  const files = fs.existsSync(rootDir) ? collectFiles(rootDir, rootDir) : []
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

  return (
    <div className="h-screen flex flex-col">
      <header className="flex items-center gap-4 px-4 py-2 border-b border-border bg-card shrink-0">
        <Link href="/">
          <Button variant="outline" size="sm" className="text-xs">
            ← Home
          </Button>
        </Link>
        <h1 className="font-serif text-lg tracking-tight">Template Viewer</h1>
      </header>

      <div className="flex-1 min-h-0">
        <TypstTempViewer files={files} basePath={basePath} fullScreen />
      </div>
    </div>
  )
}
