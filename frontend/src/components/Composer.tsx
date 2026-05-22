import { useEffect, useRef } from "react";

const EXAMPLE_PROMPTS = [
  "Show me the top 10 riskiest conjunctions in the TraCSS dataset",
  "Is the ISS at risk this week?",
  "My CubeSat at 530 km, 53° inclination — collision risk for the next 30 days?",
  "Find the minimum-Δv avoidance burn for a 100 m close approach",
  "Plan a coordinated maneuver for my fleet of 5 satellites",
];

export default function Composer({
  value,
  onChange,
  onSubmit,
  showExamples,
  onExampleClick,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  showExamples: boolean;
  onExampleClick: (q: string) => void;
  disabled: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea up to a max height
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [value]);

  return (
    <div className="border-t border-neutral-200 bg-white">
      {showExamples && (
        <div className="px-4 sm:px-8 pt-3 pb-1">
          <div className="text-[10.5px] uppercase tracking-wider text-neutral-400 mb-2 font-mono">
            Try one
          </div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => onExampleClick(p)}
                disabled={disabled}
                className="text-[12.5px] px-3 py-1.5 rounded-full border border-neutral-200 hover:border-neutral-900 hover:bg-neutral-50 transition-colors text-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!disabled) onSubmit();
        }}
        className="px-4 sm:px-8 py-3 flex items-end gap-3"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!disabled) onSubmit();
            }
          }}
          disabled={disabled}
          placeholder="Ask about a satellite, an orbit, a maneuver, a constellation…"
          className="flex-1 min-h-[40px] max-h-[180px] resize-none border border-neutral-200 rounded-2xl px-4 py-2.5 text-[14.5px] placeholder:text-neutral-400 focus:outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-200 bg-white text-neutral-900"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="h-[40px] px-5 rounded-full bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 text-white font-medium text-[13.5px] transition-colors flex items-center gap-1.5"
        >
          Send
          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      <div className="px-4 sm:px-8 pb-3 text-[10.5px] text-neutral-400">
        Press Enter to send · Shift+Enter for a new line · All numerical answers come from verified physics tools
      </div>
    </div>
  );
}
