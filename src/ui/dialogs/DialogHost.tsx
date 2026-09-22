import { useEffect } from "react";
import { useEditorStore } from "../../state/store";
import { FilterDialog } from "./FilterDialog";
import { AdjustmentsDialog } from "./AdjustmentsDialog";
import { CurvesDialog } from "./CurvesDialog";
import { LevelsDialog } from "./LevelsDialog";
import { ExportDialog } from "./ExportDialog";
import { FillDialog } from "./FillDialog";
import { ImageSizeDialog, CanvasSizeDialog } from "./ImageSizeDialog";
import { TextEditDialog } from "./TextEditDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { AboutDialog } from "./AboutDialog";
import { UserGuideDialog } from "./UserGuideDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { PreferencesDialog } from "./PreferencesDialog";
import { RecoveryDialog } from "./RecoveryDialog";
import { DocumentInfoDialog } from "./DocumentInfoDialog";
import { NoticeDialog } from "./NoticeDialog";
import { AddPrimitiveDialog } from "./AddPrimitiveDialog";
import { AddLightDialog } from "./AddLightDialog";
import { Import3DDialog } from "./Import3DDialog";
import { MorphologyDialog } from "./MorphologyDialog";
import { AdjustmentLayerDialog } from "./AdjustmentLayerDialog";
import { PathEditDialog } from "./PathEditDialog";
import { GridSettingsDialog, ArtboardDialog } from "./GridArtboardDialogs";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDialogKeyboard() {
  const dialog = useEditorStore((s) => s.dialog);
  useEffect(() => {
    if (!dialog) return;

    const raf = requestAnimationFrame(() => {
      const modal = document.querySelector<HTMLElement>(".vs-modal");
      const first = modal?.querySelector<HTMLElement>("input:not([disabled]), select:not([disabled]), textarea:not([disabled])");
      if (first) first.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        useEditorStore.getState().closeDialog();
        return;
      }
      if (e.key === "Enter") {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.tagName === "BUTTON")) return;
        const modal = document.querySelector<HTMLElement>(".vs-modal");
        const primary = modal?.querySelector<HTMLElement>(".vs-btn.primary");
        if (primary) {
          e.preventDefault();
          primary.click();
        }
        return;
      }
      if (e.key === "Tab") {
        const modal = document.querySelector<HTMLElement>(".vs-modal");
        if (!modal) return;
        const focusables = [...modal.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !modal.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !modal.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [dialog]);
}

export function DialogHost() {
  const dialog = useEditorStore((s) => s.dialog);
  useDialogKeyboard();
  if (!dialog) return null;

  switch (dialog.name) {
    case "newProject":
      return <NewProjectDialog />;
    case "unsavedChanges":
      return <UnsavedChangesDialog />;
    case "preferences":
      return <PreferencesDialog />;
    case "recovery":
      return <RecoveryDialog />;
    case "effect":
      return <FilterDialog />;
    case "adjustments":
      return <AdjustmentsDialog />;
    case "curves":
      return <CurvesDialog />;
    case "levels":
      return <LevelsDialog />;
    case "adjustment":
      return <AdjustmentLayerDialog />;
    case "export":
      return <ExportDialog />;
    case "fill":
      return <FillDialog />;
    case "imageSize":
      return <ImageSizeDialog />;
    case "canvasSize":
      return <CanvasSizeDialog />;
    case "textEdit":
      return <TextEditDialog />;
    case "pathEdit":
      return <PathEditDialog />;
    case "shortcuts":
      return <ShortcutsDialog />;
    case "about":
      return <AboutDialog />;
    case "userGuide":
      return <UserGuideDialog />;
    case "addPrimitive3d":
      return <AddPrimitiveDialog />;
    case "addLight3d":
      return <AddLightDialog />;
    case "import3d":
      return <Import3DDialog />;
    case "documentInfo":
      return <DocumentInfoDialog />;
    case "morphology":
      return <MorphologyDialog />;
    case "gridSettings":
      return <GridSettingsDialog />;
    case "artboard":
      return <ArtboardDialog />;
    case "printNotice":
    case "exitNotice":
      return <NoticeDialog />;
    default:
      return null;
  }
}
