"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type GameState = "loading" | "playing" | "done"

function parseProblemsFile(text: string): string[] {
  return text
    .split("\n")
    .map((line) => {
      let l = line.trim()
      // Remove $ delimiters if present
      if (l.startsWith("$") && l.endsWith("$") && l.length > 1) {
        l = l.slice(1, -1).trim()
      }
      return l
    })
    .filter((l) => l && !l.startsWith("#"))
}

function makeTypstDoc(math: string) {
  return [
    "#set page(width: auto, height: auto, margin: (x: 10pt, y: 6pt), fill: none)",
    "#set text(size: 22pt)",
    `$ ${math} $`,
  ].join("\n")
}

export default function TypstiquePage() {
  const [gameState, setGameState] = useState<GameState>("loading")
  const [problems, setProblems] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [solved, setSolved] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [solvedSet, setSolvedSet] = useState<Set<number>>(new Set())
  const [skippedSet, setSkippedSet] = useState<Set<number>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [userInput, setUserInput] = useState("")
  const [targetSvg, setTargetSvg] = useState("")
  const [previewSvg, setPreviewSvg] = useState("")
  const [previewError, setPreviewError] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [typstReady, setTypstReady] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const previewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    fetch("/problems.txt")
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
    
    const math = problems[currentIndex]
    try {
      // @ts-expect-error - $typst is loaded via CDN
      const svg = await window.$typst.svg({ mainContent: makeTypstDoc(math) })
      setTargetSvg(svg)
    } catch {
      setTargetSvg("")
    }
  }, [typstReady, problems, currentIndex])

  useEffect(() => {
    renderTarget()
    setUserInput("")
    setPreviewSvg("")
    setPreviewError(false)
    setIsCorrect(false)
    inputRef.current?.focus()
  }, [renderTarget])

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

    previewTimeoutRef.current = setTimeout(async () => {
      if (!typstReady) return
      try {
        // @ts-expect-error - $typst is loaded via CDN
        const svg = await window.$typst.svg({ mainContent: makeTypstDoc(userInput) })
        setPreviewSvg(svg)
        setPreviewError(false)
      } catch {
        setPreviewSvg("")
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setUserInput(value)

    if (normalize(value) === normalize(problems[currentIndex])) {
      setIsCorrect(true)
      setSolved((s) => s + 1)
      setSolvedSet((prev) => new Set(prev).add(currentIndex))
      setTimeout(() => {
        if (currentIndex + 1 >= problems.length) {
          setGameState("done")
        } else {
          setCurrentIndex((i) => i + 1)
        }
      }, 600)
    }
  }

  const handleSkip = () => {
    setSkipped((s) => s + 1)
    setSkippedSet((prev) => new Set(prev).add(currentIndex))
    if (currentIndex + 1 >= problems.length) {
      setGameState("done")
    } else {
      setCurrentIndex((i) => i + 1)
    }
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
          <Button 
            onClick={handleRestart}
            className="px-8 py-6 text-base"
          >
            Play Again
          </Button>
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
            <h1 className="font-serif text-2xl tracking-tight text-foreground">
              Typstique
            </h1>
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

          {/* Footer */}
          <footer className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {problems.length - currentIndex - 1} remaining
              {skipped > 0 && ` · ${skipped} skipped`}
            </p>
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
                  if (!isCorrect) {
                    setCurrentIndex(idx)
                  }
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
