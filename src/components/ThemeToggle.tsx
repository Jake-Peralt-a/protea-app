"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// Unknown until the theme-init script (see layout.tsx) has run on the client —
// there's no safe guess to make on the server.
function getServerSnapshot(): Theme | null {
  return null;
}

function setTheme(next: Theme) {
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  listeners.forEach((notify) => notify());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <button
      type="button"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="btn btn-secondary btn-sm flex-none"
      style={{ padding: "0.35rem", width: "2.1rem", height: "2.1rem" }}
      aria-label={
        theme === null
          ? "Toggle color theme"
          : theme === "dark"
            ? "Switch to light theme"
            : "Switch to dark theme"
      }
    >
      {theme !== null && (
        <svg
          viewBox="0 0 20 20"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {theme === "dark" ? (
            <>
              <circle cx="10" cy="10" r="3.5" />
              <path d="M10 2v1.6M10 16.4V18M18 10h-1.6M3.6 10H2M15.5 4.5l-1.1 1.1M5.6 14.4l-1.1 1.1M15.5 15.5l-1.1-1.1M5.6 5.6 4.5 4.5" />
            </>
          ) : (
            <path d="M17 11.2A7 7 0 0 1 8.8 3a7 7 0 1 0 8.2 8.2Z" />
          )}
        </svg>
      )}
    </button>
  );
}
