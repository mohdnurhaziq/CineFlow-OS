"use client";

import { useEffect } from "react";
import { reloadIfStaleVersion } from "@/lib/stale-version";

/**
 * Reloads the page when a button fails because a new version was deployed while it was open
 * (see lib/stale-version). Catches the failures nothing else handled; error pages and the
 * shared error-message helper catch the rest.
 */
export function StaleVersionReload() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (reloadIfStaleVersion(event.reason)) event.preventDefault();
    };
    const onError = (event: ErrorEvent) => {
      if (reloadIfStaleVersion(event.error)) event.preventDefault();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}
