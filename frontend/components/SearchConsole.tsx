"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { SearchRequest, Suggestion } from "@/lib/types";
import { suggest } from "@/lib/api";
import { safeYear } from "@/lib/format";
import { Poster } from "./Poster";
import { ArrowRightIcon, SearchIcon } from "./icons";

const EASE = [0.16, 1, 0.3, 1] as const;

export interface EngineControls {
  fusion: "rrf" | "weighted";
  lexicalWeight: number; // 0..1; semantic = 1 - lexicalWeight
  rerank: boolean;
}

export const DEFAULT_CONTROLS: EngineControls = {
  fusion: "rrf",
  lexicalWeight: 0.5,
  rerank: true,
};

/** Build the API request shape from the current controls. */
export function controlsToRequest(
  query: string,
  controls: EngineControls
): SearchRequest {
  return {
    query,
    fusion: controls.fusion,
    lexical_weight: controls.lexicalWeight,
    semantic_weight: Math.round((1 - controls.lexicalWeight) * 100) / 100,
    rerank: controls.rerank,
    explain: true,
  };
}

/**
 * Focal search console. Rotating placeholder, "/" to focus, debounced
 * suggestions with full keyboard nav, and a wired engine-controls row. In
 * compact mode (post-search sticky bar) it slims down and hides the controls
 * behind a toggle.
 */
export function SearchConsole({
  value,
  onChange,
  onSubmit,
  onSelectSuggestion,
  controls,
  onControlsChange,
  placeholders,
  compact = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (query: string) => void;
  onSelectSuggestion: (s: Suggestion) => void;
  controls: EngineControls;
  onControlsChange: (c: EngineControls) => void;
  placeholders: string[];
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showControls, setShowControls] = useState(!compact);

  // Rotating placeholder (paused while typing / focused).
  useEffect(() => {
    if (placeholders.length === 0 || value || focused) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = window.setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % placeholders.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [placeholders, value, focused]);

  // Global "/" focuses the input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Debounced suggestions.
  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }
    const id = window.setTimeout(() => {
      suggest(q, 8).then((res) => {
        setSuggestions(res);
        setActiveIndex(-1);
      });
    }, 180);
    return () => window.clearTimeout(id);
  }, [value]);

  const dropdownOpen = focused && suggestions.length > 0;

  const submit = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (!trimmed) return;
      setSuggestions([]);
      setActiveIndex(-1);
      inputRef.current?.blur();
      onSubmit(trimmed);
    },
    [onSubmit]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length)
        setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length)
        setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        const s = suggestions[activeIndex];
        setSuggestions([]);
        setActiveIndex(-1);
        onSelectSuggestion(s);
      } else {
        submit(value);
      }
    } else if (e.key === "Escape") {
      setSuggestions([]);
      setActiveIndex(-1);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        role="search"
      >
        <div
          className={`surface relative flex items-center gap-3 rounded-card transition-all duration-300 ${
            compact ? "px-3 py-2" : "px-4 py-3"
          } ${
            focused
              ? "border-amber-dim shadow-amber-glow"
              : "shadow-card hover:border-line-strong"
          }`}
        >
          <SearchIcon
            size={compact ? 18 : 20}
            className={focused ? "text-amber" : "text-ink-3"}
          />

          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => window.setTimeout(() => setFocused(false), 120)}
              onKeyDown={onKeyDown}
              placeholder=""
              role="combobox"
              aria-label="Search movies"
              aria-autocomplete="list"
              aria-expanded={dropdownOpen}
              aria-controls={listboxId}
              aria-activedescendant={
                activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
              }
              className={`w-full bg-transparent text-ink outline-none placeholder:text-ink-3 ${
                compact ? "text-md" : "text-md sm:text-lg"
              }`}
            />
            {/* Animated placeholder (only when empty) */}
            {!value && (
              <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={placeholderIndex}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.4, ease: EASE }}
                    className={`truncate text-ink-3 ${compact ? "text-md" : "text-md sm:text-lg"}`}
                  >
                    {placeholders[placeholderIndex] ?? "Search films…"}
                  </motion.span>
                </AnimatePresence>
              </div>
            )}
          </div>

          {!compact && (
            <kbd className="telemetry hidden shrink-0 rounded border border-line-strong px-1.5 py-0.5 text-[11px] text-ink-3 sm:block">
              /
            </kbd>
          )}

          <button
            type="submit"
            aria-label="Search"
            className={`flex shrink-0 items-center gap-1.5 rounded-btn bg-amber font-medium text-void transition-transform duration-200 hover:bg-amber-hi active:scale-95 ${
              compact ? "px-2.5 py-1.5 text-[12px]" : "px-3.5 py-2 text-[13px]"
            }`}
          >
            {compact ? (
              <ArrowRightIcon size={16} />
            ) : (
              <>
                Search
                <ArrowRightIcon size={15} />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Suggestions dropdown */}
      <AnimatePresence>
        {dropdownOpen && (
          <motion.ul
            id={listboxId}
            role="listbox"
            aria-label="Suggestions"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: EASE }}
            className="surface absolute left-0 right-0 top-full z-40 mt-2 overflow-hidden rounded-card p-1.5 shadow-panel"
          >
            {suggestions.map((s, i) => {
              const yr = safeYear(s.year);
              const active = i === activeIndex;
              return (
                <li
                  key={s.id}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={active}
                >
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onSelectSuggestion(s);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-3 rounded-btn px-2 py-1.5 text-left transition-colors ${
                      active ? "bg-amber/[0.08]" : "hover:bg-white/[0.03]"
                    }`}
                  >
                    <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-void">
                      <Poster
                        url={s.poster_url}
                        title={s.title}
                        year={yr}
                        sizes="32px"
                      />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {s.title}
                    </span>
                    {yr != null && (
                      <span className="telemetry text-[11px] text-ink-3">
                        {yr}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>

      {/* Engine controls */}
      <EngineControlsRow
        controls={controls}
        onChange={onControlsChange}
        compact={compact}
        expanded={showControls}
        onToggle={() => setShowControls((s) => !s)}
      />
    </div>
  );
}

/* ---------------- Engine controls ---------------- */

function EngineControlsRow({
  controls,
  onChange,
  compact,
  expanded,
  onToggle,
}: {
  controls: EngineControls;
  onChange: (c: EngineControls) => void;
  compact: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${
        compact ? "mt-2" : "mt-3 px-1"
      }`}
    >
      {compact && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="telemetry text-[11px] uppercase tracking-[0.14em] text-ink-3 transition-colors hover:text-ink-2"
        >
          engine {expanded ? "−" : "+"}
        </button>
      )}

      {(!compact || expanded) && (
        <>
          <FusionToggle
            value={controls.fusion}
            onChange={(fusion) => onChange({ ...controls, fusion })}
          />

          <AnimatePresence initial={false}>
            {controls.fusion === "weighted" && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="overflow-hidden"
              >
                <WeightSlider
                  value={controls.lexicalWeight}
                  onChange={(lexicalWeight) =>
                    onChange({ ...controls, lexicalWeight })
                  }
                />
              </motion.div>
            )}
          </AnimatePresence>

          <RerankSwitch
            value={controls.rerank}
            onChange={(rerank) => onChange({ ...controls, rerank })}
          />
        </>
      )}
    </div>
  );
}

function FusionToggle({
  value,
  onChange,
}: {
  value: "rrf" | "weighted";
  onChange: (v: "rrf" | "weighted") => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="label-eyebrow">Fusion</span>
      <div
        role="radiogroup"
        aria-label="Fusion strategy"
        className="relative flex rounded-btn border border-line bg-black/30 p-0.5"
      >
        {(["rrf", "weighted"] as const).map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt)}
              className="relative px-2.5 py-1 text-[12px] font-medium"
            >
              {active && (
                <motion.span
                  layoutId="fusion-pill"
                  className="absolute inset-0 rounded-[7px] bg-amber/[0.14] ring-1 ring-inset ring-amber-dim"
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                />
              )}
              <span
                className={`relative telemetry uppercase tracking-wide ${
                  active ? "text-amber-hi" : "text-ink-3"
                }`}
              >
                {opt === "rrf" ? "RRF" : "Weighted"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeightSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const lexPct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span className="telemetry text-[11px] text-amber">
        lex {lexPct}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={lexPct}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        aria-label="Lexical to semantic weight balance"
        className="cine-slider h-1.5 w-28 appearance-none rounded-chip"
        style={{
          background: `linear-gradient(90deg, var(--amber) 0%, var(--amber) ${lexPct}%, var(--steel) ${lexPct}%, var(--steel) 100%)`,
        }}
      />
      <span className="telemetry text-[11px] text-steel">
        sem {100 - lexPct}
      </span>
    </div>
  );
}

function RerankSwitch({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2">
      <span className="label-eyebrow">Rerank</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label="Toggle cross-encoder rerank"
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-chip border transition-colors duration-200 ${
          value
            ? "border-amber-dim bg-amber/[0.18]"
            : "border-line bg-black/30"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 620, damping: 34 }}
          className={`absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full ${
            value ? "left-[18px] bg-amber" : "left-[3px] bg-ink-3"
          }`}
        />
      </button>
    </label>
  );
}
