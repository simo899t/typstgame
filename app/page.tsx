import fs from "node:fs"
import path from "node:path"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { TypstTempViewer, type TypstFile } from "@/components/typst-temp-viewer"

const VIEWABLE_EXTENSIONS = new Set([
  ".typ", ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".tex", ".bib",
])

const MAX_INLINE_BYTES = 256 * 1024

function loadTypstTempFiles(): TypstFile[] {
  const dir = path.join(process.cwd(), "public", "typst_temp")
  if (!fs.existsSync(dir)) return []

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files: TypstFile[] = []

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (entry.name.startsWith(".")) continue

    const full = path.join(dir, entry.name)
    const stat = fs.statSync(full)
    const ext = path.extname(entry.name).toLowerCase()

    const isViewable = VIEWABLE_EXTENSIONS.has(ext) && stat.size <= MAX_INLINE_BYTES
    const content = isViewable
      ? fs.readFileSync(full, "utf8")
      : `[Binary or large file (${stat.size} bytes). Use the download button to grab it.]`

    files.push({ name: entry.name, size: stat.size, content })
  }

  return files.sort((a, b) => a.name.localeCompare(b.name))
}

export default function LandingPage() {
  const files = loadTypstTempFiles()
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-16">
      <div className="w-full max-w-3xl space-y-12">
        <header className="text-center space-y-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            A Typst playground
          </p>
          <h1 className="font-serif text-6xl md:text-7xl tracking-tight text-foreground">
            Typstique
          </h1>
          <p className="text-base text-muted-foreground max-w-xl mx-auto">
            Practice typing Typst math, learn what Typst is, and grab the
            template I use for my own notes.
          </p>
        </header>

        <section>
          <details className="group bg-card border border-border rounded-lg open:shadow-sm transition-shadow">
            <summary className="list-none cursor-pointer p-6 flex items-center justify-between gap-4 select-none">
              <div className="flex items-baseline gap-3">
                <h2 className="font-serif text-2xl tracking-tight">
                  What is Typst?
                </h2>
                <span className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
                  and why it beats LaTeX
                </span>
              </div>
              <span
                aria-hidden
                className="text-muted-foreground transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>

            <div className="px-6 pb-6 space-y-5 border-t border-border pt-5">
              <div className="flex items-baseline justify-end">
                <a
                  href="https://typst.app/docs/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Docs ↗
                </a>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Typst is a modern, open-source typesetting system. Like LaTeX,
                it takes a plain-text source and produces a PDF — but it was built from scratch in 2023 with the lessons of
                forty years of LaTeX pain in mind.
              </p>

              <div className="grid gap-4 sm:grid-cols-2 pt-2">
                <Bullet
                  title="Fast compilation"
                  body="Typst uses a modern engine with 'incremental compilation', this means that only the changed parts of the document are recomputed instead of rebuilding everything. Because of this, typst can live preview a pdf as you type."
                />
                <Bullet
                  title="Much more readable syntax"
                  body="Unlike LaTeX, typst doesn't use the same backslashes and curly-brackets, instead, functions are written in a cleaner, more programming-like syntax with normal parentheses and brackets. This not only makes debugging easier but also makes the code way more readable."
                />
                <Bullet
                  title="Error pinpoint"
                  body="Typst gives clear error messages that highlight the exact line and explain the issue directly, instead of dumping a 200-line LaTeX log — whether you use the native app or compile it on your own PC."
                />
                <Bullet
                  title="Less imports/libraries"
                  body="Math, figures, citations, tables, and a built-in package system — Typst handles most of it out of the box, so you rarely need to import extra packages like in LaTeX."
                />
                <Bullet
                  title="Real functions, real variables"
                  body="#let, real scoping, first-class functions — you can easily define functions, pass them around, and reuse them cleanly, which makes everything much easier and more structured than LaTeX macros."
                />
                <Bullet
                  title="One binary, zero setup"
                  body="After install it just works, no TeX Live or dependency chains to manage.
Because it’s built in Rust, it compiles to a single fast, portable executable with no runtime clutter or external tooling needed."
                />
              </div>
            </div>
          </details>
        </section>

        <section className="bg-card border border-border rounded-lg p-8 space-y-5">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-serif text-2xl tracking-tight">
                Template for usage
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                The template and example files I use for my university notes.
              </p>
            </div>
          </div>
          <TypstTempViewer files={files} basePath={basePath} />
        </section>

        <section className="text-center space-y-4 pt-4">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Want to practice?
          </p>
          <Link href="/game">
            <Button className="px-8 py-6 text-base">
              Play the Typing Game →
            </Button>
          </Link>
        </section>

        <footer className="text-center text-xs text-muted-foreground pt-8">
          Built with Next.js · Typeset with Typst
        </footer>
      </div>
    </main>
  )
}

function Bullet({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  )
}
