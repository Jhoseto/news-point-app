"use client";

import { useEffect, useState } from "react";
import release from "../data/release.json";
import snapshot from "../data/party-positions.json";
import sources from "../data/sources.json";
import evidence from "../data/evidence.json";
import entities from "../data/entities.json";
import questions from "../data/questions.bg.json";
import { loadPublishedRelease } from "../src/published-release.mjs";

const baseline = { release, snapshot, sources, evidence, entities };

export function fetchPublishedRelease(signal) {
  return loadPublishedRelease({ baseline, questions, signal });
}

export function usePublishedRelease(revision = 0) {
  const [bundle, setBundle] = useState({ ...baseline, loading: true, fallback: false });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    fetchPublishedRelease(controller.signal).then((next) => {
      window.clearTimeout(timer);
      if (active) setBundle(next);
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [revision]);
  return bundle;
}
