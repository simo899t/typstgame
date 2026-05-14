"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type GameState = "loading" | "playing" | "done"

type Problem = { math: string; hint?: string }

function parseProblemsFile(text: string): Problem[] {
  return text
    .split("\n")
    .map((line): Problem | null => {
      const l = line.trim()
      if (!l || l.startsWith("#")) return null

      // Split math and hint on the first unescaped '#'
      const hashIdx = l.indexOf("#")
      let math = (hashIdx >= 0 ? l.slice(0, hashIdx) : l).trim()
      const hint = hashIdx >= 0 ? l.slice(hashIdx + 1).trim() : undefined

      // Remove $ delimiters if present
      if (math.startsWith("$") && math.endsWith("$") && math.length > 1) {
        math = math.slice(1, -1).trim()
      }
      if (!math) return null
      return { math, hint: hint || undefined }
    })
    .filter((p): p is Problem => p !== null)
}

function makeTypstDoc(math: string) {
  return [
    "#set page(width: auto, height: auto, margin: (x: 10pt, y: 6pt), fill: none)",
    "#set text(size: 22pt)",
    `$ ${math} $`,
  ].join("\n")
}

// Make sure the SVG has the namespace declaration — browsers refuse to
// render it inside <img> without one.
function ensureSvgNamespace(svg: string): string {
  if (/<svg[^>]*\sxmlns\s*=/.test(svg)) return svg
  return svg.replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"')
}

// Load an SVG string into an HTMLImageElement so we can rasterize it.
// Uses a base64 data URL + img.decode() for the most reliable cross-browser path.
async function loadSvgImage(svg: string): Promise<HTMLImageElement | null> {
  try {
    const normalized = ensureSvgNamespace(svg)
    const bytes = new TextEncoder().encode(normalized)
    let binary = ""
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const url = "data:image/svg+xml;base64," + btoa(binary)
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } catch {
    return null
  }
}

// Parse SVG width/height attributes as fallback for naturalWidth/naturalHeight,
// since some browsers report 0 for SVGs with pt-unit dimensions.
function parseSvgSize(svg: string): { w: number; h: number } | null {
  const wMatch = svg.match(/<svg[^>]*\swidth="([^"]+)"/)
  const hMatch = svg.match(/<svg[^>]*\sheight="([^"]+)"/)
  if (!wMatch || !hMatch) {
    // Try viewBox as last resort.
    const vb = svg.match(/<svg[^>]*\sviewBox="([\d.\s-]+)"/)
    if (!vb) return null
    const parts = vb[1].trim().split(/\s+/).map(Number)
    if (parts.length !== 4 || parts.some(Number.isNaN)) return null
    return { w: parts[2], h: parts[3] }
  }
  const toPx = (s: string) => {
    const m = s.match(/^([\d.]+)\s*([a-z%]*)$/i)
    if (!m) return NaN
    const v = parseFloat(m[1])
    const unit = m[2].toLowerCase()
    if (unit === "pt") return v * (96 / 72)
    if (unit === "" || unit === "px") return v
    return v
  }
  const w = toPx(wMatch[1])
  const h = toPx(hMatch[1])
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null
  return { w, h }
}

// Rasterize an image onto a white canvas of the given size, top-left aligned.
function rasterize(img: HTMLImageElement, w: number, h: number): ImageData | null {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.ceil(w))
  canvas.height = Math.max(1, Math.ceil(h))
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

// Count what fraction of pixels differ between two equally-sized image buffers.
// Uses luminance difference with a per-channel tolerance to absorb anti-aliasing noise.
function pixelDiffRatio(a: ImageData, b: ImageData): number {
  if (a.width !== b.width || a.height !== b.height) return 1
  const ad = a.data
  const bd = b.data
  const len = ad.length
  let diff = 0
  for (let i = 0; i < len; i += 4) {
    const aL = ad[i] * 0.299 + ad[i + 1] * 0.587 + ad[i + 2] * 0.114
    const bL = bd[i] * 0.299 + bd[i + 1] * 0.587 + bd[i + 2] * 0.114
    if (Math.abs(aL - bL) > 24) diff++
  }
  return diff / (len / 4)
}

// Strip the parts of an SVG that vary across renders without affecting the
// visual output: variable ID suffixes, whitespace, formatting. Typst gives
// glyphs stable content-derived IDs, so two visually-identical SVGs from the
// same Typst version normalize to the same string.
function normalizeSvgForCompare(svg: string): string {
  return svg
    .replace(/\sid="[^"]*"/g, "")
    .replace(/\sdata-tid="[^"]*"/g, "")
    .replace(/\s(?:xlink:)?href="#[^"]*"/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim()
}

// Compare two SVGs. Fast path: smart string normalization (catches identical
// renders cheaply). Fallback: rasterize each to a canvas and pixel-diff.
async function svgsLookEqual(svgA: string, svgB: string): Promise<boolean> {
  if (normalizeSvgForCompare(svgA) === normalizeSvgForCompare(svgB)) return true

  const [imgA, imgB] = await Promise.all([loadSvgImage(svgA), loadSvgImage(svgB)])
  if (!imgA || !imgB) return false
  const sizeA = imgA.naturalWidth > 0 && imgA.naturalHeight > 0
    ? { w: imgA.naturalWidth, h: imgA.naturalHeight }
    : parseSvgSize(svgA)
  const sizeB = imgB.naturalWidth > 0 && imgB.naturalHeight > 0
    ? { w: imgB.naturalWidth, h: imgB.naturalHeight }
    : parseSvgSize(svgB)
  if (!sizeA || !sizeB) return false

  // If dimensions differ wildly, the images are clearly different.
  // Allow up to 8% size difference to absorb sub-pixel rounding between identical-looking renders.
  const wRatio = Math.min(sizeA.w, sizeB.w) / Math.max(sizeA.w, sizeB.w)
  const hRatio = Math.min(sizeA.h, sizeB.h) / Math.max(sizeA.h, sizeB.h)
  if (wRatio < 0.92 || hRatio < 0.92) return false

  // Rasterize both onto a canvas sized to the union, padded with white.
  const w = Math.max(sizeA.w, sizeB.w)
  const h = Math.max(sizeA.h, sizeB.h)
  const dataA = rasterize(imgA, w, h)
  const dataB = rasterize(imgB, w, h)
  if (!dataA || !dataB) return false

  // Allow up to 1.5% of pixels to differ — handles anti-aliasing along glyph edges.
  return pixelDiffRatio(dataA, dataB) < 0.015
}

export default function TypstiquePage() {
  const [gameState, setGameState] = useState<GameState>("loading")
  const [problems, setProblems] = useState<Problem[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [solved, setSolved] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [solvedSet, setSolvedSet] = useState<Set<number>>(new Set())
  const [skippedSet, setSkippedSet] = useState<Set<number>>(new Set())
  const [solvedAnswers, setSolvedAnswers] = useState<Map<number, string>>(new Map())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userInput, setUserInput] = useState("")
  const [targetSvg, setTargetSvg] = useState("")
  const [targetSvgIndex, setTargetSvgIndex] = useState(-1)
  const [previewSvg, setPreviewSvg] = useState("")
  const [previewSvgInput, setPreviewSvgInput] = useState("")
  const [previewError, setPreviewError] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [solutionShown, setSolutionShown] = useState(false)
  const [hintShown, setHintShown] = useState(false)
  const [typstReady, setTypstReady] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const solvedAnswersRef = useRef<Map<number, string>>(new Map())
  solvedAnswersRef.current = solvedAnswers

  // Load Typst WASM
  useEffect(() => {
    const script = document.createElement("script")
    script.type = "module"
    script.src = "https://cdn.jsdelivr.net/npm/@myriaddreamin/typst-all-in-one.ts@0.6.0/dist/esm/index.js"
    script.onload = () => {
      setTypstReady(true)
    }
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
  }, [])

  // Load problems from file
  const [problemsLoaded, setProblemsLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
    fetch(`${basePath}/problems.txt`)
      .then((r) => r.text())
      .then((text) => {
        const parsed = parseProblemsFile(text)
        if (parsed.length === 0) {
          setLoadError("No problems found in problems.txt")
          return
        }
        setProblems(parsed)
        setProblemsLoaded(true)
      })
      .catch(() => {
        setLoadError("Could not load problems.txt")
      })
  }, [])

  // Initialize game when both Typst and problems are ready
  useEffect(() => {
    if (typstReady && problemsLoaded) {
      setGameState("playing")
    }
  }, [typstReady, problemsLoaded])

  // Render target when problem changes
  const renderTarget = useCallback(async () => {
    if (!typstReady || problems.length === 0 || currentIndex >= problems.length) return

    const indexAtCall = currentIndex
    const math = problems[indexAtCall].math
    try {
      // @ts-expect-error - $typst is loaded via CDN
      const svg = await window.$typst.svg({ mainContent: makeTypstDoc(math) })
      setTargetSvg(svg)
      setTargetSvgIndex(indexAtCall)
    } catch {
      setTargetSvg("")
      setTargetSvgIndex(-1)
    }
  }, [typstReady, problems, currentIndex])

  useEffect(() => {
    renderTarget()
    const savedAnswer = solvedAnswersRef.current.get(currentIndex)
    if (savedAnswer !== undefined) {
      setUserInput(savedAnswer)
      setIsCorrect(true)
    } else {
      setUserInput("")
      setIsCorrect(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
    setPreviewSvg("")
    setPreviewSvgInput("")
    setPreviewError(false)
    setSolutionShown(false)
    setHintShown(false)
  }, [renderTarget, currentIndex])

  // Live preview with debounce
  useEffect(() => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }

    if (!userInput.trim()) {
      setPreviewSvg("")
      setPreviewError(false)
      return
    }

    const capturedInput = userInput
    previewTimeoutRef.current = setTimeout(async () => {
      if (!typstReady) return
      try {
        // @ts-expect-error - $typst is loaded via CDN
        const svg = await window.$typst.svg({ mainContent: makeTypstDoc(capturedInput) })
        setPreviewSvg(svg)
        setPreviewSvgInput(capturedInput)
        setPreviewError(false)
      } catch {
        setPreviewSvg("")
        setPreviewSvgInput("")
        setPreviewError(true)
      }
    }, 200)

    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current)
      }
    }
  }, [userInput, typstReady])

  // Check for correct answer
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ")

  const markCorrect = useCallback(
    (answer: string) => {
      setIsCorrect(true)
      setSolved((s) => s + 1)
      setSolvedSet((prev) => new Set(prev).add(currentIndex))
      setSolvedAnswers((prev) => new Map(prev).set(currentIndex, answer))
      advanceTimeoutRef.current = setTimeout(() => {
        advanceTimeoutRef.current = null
        if (currentIndex + 1 >= problems.length) {
          setGameState("done")
        } else {
          setCurrentIndex((i) => i + 1)
        }
      }, 600)
    },
    [currentIndex, problems.length]
  )

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUserInput(value)

    if (
      !solutionShown &&
      !solvedSet.has(currentIndex) &&
      normalize(value) === normalize(problems[currentIndex].math)
    ) {
      markCorrect(value)
    }
  }

  // Accept any input whose rendered image matches the target (within tolerance).
  // This makes alternative valid Typst forms succeed, and forgives tiny spacing
  // differences that don't affect the visible output.
  useEffect(() => {
    if (!previewSvg || !targetSvg) return
    if (targetSvgIndex !== currentIndex) return
    if (previewSvgInput !== userInput) return
    if (solutionShown) return
    if (solvedSet.has(currentIndex)) return

    let cancelled = false
    svgsLookEqual(previewSvg, targetSvg).then((equal) => {
      if (cancelled || !equal) return
      // Guard again in case state moved on while we were rasterizing.
      if (targetSvgIndex !== currentIndex) return
      if (previewSvgInput !== userInput) return
      if (solutionShown || solvedSet.has(currentIndex)) return
      markCorrect(userInput)
    })
    return () => {
      cancelled = true
    }
  }, [
    previewSvg,
    previewSvgInput,
    targetSvg,
    targetSvgIndex,
    solutionShown,
    solvedSet,
    currentIndex,
    userInput,
    markCorrect,
  ])

  const handleSkip = () => {
    setSkipped((s) => s + 1)
    setSkippedSet((prev) => new Set(prev).add(currentIndex))
    if (currentIndex + 1 >= problems.length) {
      setGameState("done")
    } else {
      setCurrentIndex((i) => i + 1)
    }
  }

  const handleShowSolution = () => {
    if (solutionShown) return
    setSolutionShown(true)
    if (!skippedSet.has(currentIndex)) {
      setSkipped((s) => s + 1)
      setSkippedSet((prev) => new Set(prev).add(currentIndex))
    }
  }

  const handleShowHint = () => {
    setHintShown(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault()
      handleSkip()
    }
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setSolved(0)
    setSkipped(0)
    setSolvedSet(new Set())
    setSkippedSet(new Set())
    setSolvedAnswers(new Map())
    setUserInput("")
    setGameState("playing")
  }

  // Loading screen
  if (gameState === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-6">
          <h1 className="font-serif text-5xl md:text-7xl tracking-tight text-foreground">
            Typstique
          </h1>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            A Typst Math Typing Practice
          </p>
          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-foreground/30 animate-pulse" />
              <span className="w-2 h-2 rounded-full bg-foreground/30 animate-pulse [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-foreground/30 animate-pulse [animation-delay:300ms]" />
            </div>
          )}
        </div>
      </main>
    )
  }

  // Done screen
  if (gameState === "done") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center space-y-8 max-w-md">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Completed
          </p>
          <h1 className="font-serif text-6xl md:text-8xl tracking-tight text-foreground">
            {solved} / {problems.length}
          </h1>
          <p className="text-muted-foreground">
            {skipped > 0 && `${skipped} skipped`}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={handleRestart}
              className="px-8 py-6 text-base"
            >
              Play Again
            </Button>
            <Link href="/">
              <Button variant="outline" className="px-8 py-6 text-base">
                ← Home
              </Button>
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Game screen
  return (
    <main className="min-h-screen flex">
      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
        <div className="w-full max-w-2xl space-y-6">
          {/* Header */}
          <header className="flex items-center justify-between">
            <Link
              href="/"
              className="font-serif text-2xl tracking-tight text-foreground hover:text-accent transition-colors"
            >
              Typstique
            </Link>
            <div className="flex items-center gap-8">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Problem
                </p>
                <p className="text-lg font-medium tabular-nums">
                  {currentIndex + 1} / {problems.length}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Solved
                </p>
                <p className="text-lg font-medium tabular-nums">{solved}</p>
              </div>
            </div>
          </header>

          {/* Target formula */}
          <div
            className={cn(
              "bg-card border border-border rounded-lg p-10 flex items-center justify-center min-h-[140px] transition-colors duration-300",
              isCorrect && "border-success bg-success/5"
            )}
          >
            <div
              className="[&_svg]:max-w-full [&_svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: targetSvg }}
            />
          </div>

          {/* Input */}
          <div
            className={cn(
              "bg-card border border-border rounded-lg flex items-center px-4 transition-colors duration-200 focus-within:border-foreground/30",
              isCorrect && "border-success"
            )}
          >
            <span className="text-accent font-mono text-lg select-none mr-3">$</span>
            <Input
              ref={inputRef}
              type="text"
              value={userInput}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="type typst math..."
              className="border-0 shadow-none focus-visible:ring-0 font-mono py-4 px-0 bg-transparent placeholder:text-muted-foreground/40"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isCorrect}
            />
            <span className="text-accent font-mono text-lg select-none ml-3">$</span>
          </div>

          {/* Preview */}
          <div
            className={cn(
              "bg-card border border-border rounded-lg p-6 flex items-center justify-center min-h-[80px] transition-colors duration-300",
              isCorrect && "border-success bg-success/5"
            )}
          >
            {previewSvg ? (
              <div
                className="[&_svg]:max-w-full [&_svg]:h-auto [&_svg]:scale-75"
                dangerouslySetInnerHTML={{ __html: previewSvg }}
              />
            ) : previewError ? (
              <p className="text-sm text-destructive italic">parse error</p>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic">
                your output appears here
              </p>
            )}
          </div>

          {/* Hint reveal */}
          {hintShown && problems[currentIndex].hint && (
            <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground shrink-0">
                Hint
              </span>
              <p className="text-sm text-foreground italic break-words">
                {problems[currentIndex].hint}
              </p>
            </div>
          )}

          {/* Solution reveal */}
          {solutionShown && (
            <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground shrink-0">
                Solution
              </span>
              <code className="font-mono text-sm text-foreground break-all">
                {problems[currentIndex].math}
              </code>
            </div>
          )}

          {/* Footer */}
          <footer className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {problems.length - currentIndex - 1} remaining
              {skipped > 0 && ` · ${skipped} skipped`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleShowHint}
                disabled={hintShown || !problems[currentIndex]?.hint}
                className="text-xs"
              >
                Hint
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleShowSolution}
                disabled={isCorrect || solutionShown}
                className="text-xs"
              >
                Show Solution
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSkip}
                disabled={isCorrect}
                className="text-xs"
              >
                Skip{" "}
                <kbd className="ml-2 px-1.5 py-0.5 text-[10px] bg-muted rounded">
                  Tab
                </kbd>
              </Button>
            </div>
          </footer>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute right-4 top-4 p-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={sidebarOpen ? "Hide problems list" : "Show problems list"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M15 3v18" />
          </svg>
        </button>
      </div>

      {/* Problems sidebar - right side */}
      <aside
        className={cn(
          "w-64 border-l border-border bg-card/50 p-4 overflow-y-auto transition-all duration-300",
          sidebarOpen ? "translate-x-0" : "translate-x-full w-0 p-0 border-0"
        )}
      >
        <div className={cn("space-y-1", !sidebarOpen && "hidden")}>
          <h2 className="text-xs uppercase tracking-[0.15em] text-muted-foreground mb-4 px-2">
            Problems
          </h2>
          {problems.map((_, idx) => {
            const isSolved = solvedSet.has(idx)
            const isSkipped = skippedSet.has(idx)
            const isCurrent = idx === currentIndex

            return (
              <button
                key={idx}
                onClick={() => {
                  if (advanceTimeoutRef.current) {
                    clearTimeout(advanceTimeoutRef.current)
                    advanceTimeoutRef.current = null
                  }
                  setCurrentIndex(idx)
                }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                  isCurrent
                    ? "bg-foreground text-background"
                    : isSolved
                      ? "bg-success/10 hover:bg-success/20"
                      : isSkipped
                        ? "bg-muted hover:bg-muted/80"
                        : "text-muted-foreground hover:bg-muted/50"
                )}
              >
                <span>Problem {idx + 1}</span>
                {(isSolved || isSkipped) && (
                  <span
                    className={cn(
                      "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded",
                      isCurrent
                        ? "bg-background/20 text-background"
                        : isSolved
                          ? "bg-success/20 text-success"
                          : "bg-foreground/10 text-muted-foreground"
                    )}
                  >
                    {isSolved ? "solved" : "skipped"}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </aside>
    </main>
  )
}
