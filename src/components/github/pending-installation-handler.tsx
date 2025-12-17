"use client";

import { useEffect } from "react";

/**
 * Handles processing pending GitHub App installations
 * Checks for pending_installation cookie and processes it
 */
export function PendingInstallationHandler() {
  useEffect(() => {
    // Check if we have a pending installation cookie
    const hasPendingCookie = document.cookie.includes("pending_installation=");

    if (hasPendingCookie) {
      // Process the pending installation
      fetch("/api/github/app/process-pending", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (data.processed) {
            console.log("[GitHub] Installation processed:", data.action);
          }
        })
        .catch((err) => {
          console.error("[GitHub] Failed to process installation:", err);
        });
    }
  }, []);

  return null;
}
