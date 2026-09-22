import { useEffect } from "react";
import { runtime } from "../editor/core/runtime";
import { editorEngine } from "../editor/core/engine";
import { Workspace } from "../ui/layout/Workspace";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { processingEngine } from "../editor/processing/processingEngine";
import { useEditorStore } from "../state/store";
import { t, getLanguage, setLanguage, LANGUAGES, getDirection } from "../i18n";

export function App() {
  useEffect(() => {
    runtime.engine = editorEngine;
    editorEngine.init();
    editorEngine.refreshRecentProjects();

    const recoveries = editorEngine.listRecoverableDocuments();
    if (recoveries.length > 0) {
      useEditorStore.getState().openDialog({ name: "recovery" });
    }
  }, []);

  useEffect(() => {
    // Set document direction based on language
    const updateDirection = () => {
      const html = document.documentElement;
      html.setAttribute("dir", getDirection());
      html.lang = getLanguage();
    };

    // Initial set
    updateDirection();

    // Subscribe to language changes
    const unsub = useEditorStore.subscribe((state) => {
      updateDirection();
    });

    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (useEditorStore.getState().dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    // Terminate the processing worker when the page goes away so it never
    // lingers after the editor is closed.
    const handler = () => processingEngine.dispose();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    // Paste an image from the system clipboard (e.g. a screenshot or a copied
    // image) through the same import pipeline. Never interferes with typing:
    // editable fields keep their native paste behavior.
    const handler = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) void runtime.engine?.importImageFile(file);
          return;
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  useKeyboardShortcuts();

  return <Workspace />;
}