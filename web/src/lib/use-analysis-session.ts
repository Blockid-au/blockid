"use client";

import { useEffect, useState, useCallback } from "react";

interface SavedAnalysis {
  slug: string;
  totalSVI: number;
  stage: number;
  stageLabel: string;
  summary: string;
  createdAt: string;
  inputPreview: string;
  email?: string;
}

const STORAGE_KEY = "blockid_analyses";
const MAX_SAVED = 20;

export function useAnalysisSessions() {
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setAnalyses(JSON.parse(raw));
    } catch {}
  }, []);

  const save = useCallback((analysis: SavedAnalysis) => {
    setAnalyses(prev => {
      const filtered = prev.filter(a => a.slug !== analysis.slug);
      const updated = [analysis, ...filtered].slice(0, MAX_SAVED);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  const remove = useCallback((slug: string) => {
    setAnalyses(prev => {
      const updated = prev.filter(a => a.slug !== slug);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }, []);

  return { analyses, save, remove };
}
