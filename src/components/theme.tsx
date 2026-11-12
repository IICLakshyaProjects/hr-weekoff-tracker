"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "@/lib/theme-script";

const STORAGE_KEY = THEME_STORAGE_KEY;

export function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.add("theme-anim");
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem(STORAGE_KEY, theme);
  window.setTimeout(() => document.documentElement.classList.remove("theme-anim"), 200);
}

export function readTheme(): "light" | "dark" {
  if (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark") return "dark";
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Re-applies the saved theme after hydration, in case the markup did not include it. */
export function ThemeSync() {
  useEffect(() => {
    const theme = readTheme();
    if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  }, []);
  return null;
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const dark = theme === "dark";
  const label = dark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      className={`theme-toggle btn ${className}`}
      aria-label={label}
      title={label}
      onClick={() => {
        const next = dark ? "light" : "dark";
        applyTheme(next);
        setTheme(next);
      }}
    >
      <span aria-hidden="true">{dark ? "🌙" : "☀️"}</span>
    </button>
  );
}
