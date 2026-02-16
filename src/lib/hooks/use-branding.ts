"use client";

import { useState, useEffect } from "react";

interface Branding {
  appName: string;
  hasLogo: boolean;
}

const DEFAULTS: Branding = { appName: "DocuMind", hasLogo: false };

let cached: Branding | null = null;

export function useBranding() {
  const [branding, setBranding] = useState<Branding>(cached || DEFAULTS);

  useEffect(() => {
    if (cached) {
      setBranding(cached);
      return;
    }
    fetch("/api/settings/branding")
      .then((r) => r.json())
      .then((data) => {
        cached = data;
        setBranding(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onBrandingChanged() {
      cached = null;
      fetch("/api/settings/branding")
        .then((r) => r.json())
        .then((data) => {
          cached = data;
          setBranding(data);
        })
        .catch(() => {});
    }
    window.addEventListener("branding-changed", onBrandingChanged);
    return () => window.removeEventListener("branding-changed", onBrandingChanged);
  }, []);

  return branding;
}
