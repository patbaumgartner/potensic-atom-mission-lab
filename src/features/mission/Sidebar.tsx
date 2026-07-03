// Composes the left-hand control panel from focused section components.
import type { ChangeEvent } from "react";
import { DroneMark } from "../../components/icons";
import type { UseMissionImportReturn } from "../../hooks/useMissionImport";
import type { UseTrackAnalysisReturn } from "../../hooks/useTrackAnalysis";
import type { FormKind, FormParams } from "./formBuilder";
import type { ValidationIssue } from "./missionTypes";
import { AnalysisSection } from "./panels/AnalysisSection";
import { FormSection } from "./panels/FormSection";
import { LibrarySection } from "./panels/LibrarySection";
import { LoadExportSection } from "./panels/LoadExportSection";
import { MetadataSection } from "./panels/MetadataSection";
import { PositionSection } from "./panels/PositionSection";
import { SafetySection } from "./panels/SafetySection";
import { StatsAndValidationSection } from "./panels/StatsAndValidationSection";
import type { SavedMission } from "./useMissionLibrary";

export interface SidebarProps {
  missionImport: UseMissionImportReturn;
  isImported: boolean;
  bumpFit: () => void;
  busy: boolean;
  exportDisabled: boolean;
  waypointsEmpty: boolean;
  onExportMapDb: () => void;
  onExportGeoJSON: () => void;
  onExportChecklist: () => void;
  onExportProject: () => void;
  onImportProject: (e: ChangeEvent<HTMLInputElement>) => void;

  params: FormParams;
  set: (patch: Partial<FormParams>) => void;
  commit: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  onSelectForm: (kind: FormKind) => void;
  editAsPoints: () => void;
  reversePoints: () => void;
  mirrorAcrossCenter: () => void;
  closeLoopPoints: () => void;
  removeLastPoint: () => void;

  name: string;
  setName: (v: string) => void;
  chunkSize: number;
  setChunkSize: (v: number) => void;
  heightM: number;
  setHeightM: (v: number) => void;
  speedMs: number;
  setSpeedMs: (v: number) => void;

  library: SavedMission[];
  editingId: string | null;
  onAddToLibrary: () => void;
  onFitAll: () => void;
  onRename: (id: string, name: string) => void;
  onLoad: (e: SavedMission) => void;
  onDuplicate: (id: string) => void;
  onExportEntry: (e: SavedMission) => void;
  onRemove: (id: string) => void;

  batteryMin: number;
  setBatteryMin: (v: number) => void;
  reservePct: number;
  setReservePct: (v: number) => void;
  geofenceM: number;
  setGeofenceM: (v: number) => void;
  enduranceFrac: number;
  durationFmt: string;
  usableMin: number;
  maxHomeM: number;

  waypointCount: number;
  distanceM: number;
  chunkCount: number;
  headingLabel: string;
  issues: ValidationIssue[];
  geofenceBreached: boolean;

  trackAnalysis: UseTrackAnalysisReturn;
}

export function Sidebar(props: SidebarProps) {
  return (
    <div className="panel-wrap">
      <aside className="panel">
        <header className="brand">
          <DroneMark />
          <div>
            <h1>Potensic Atom Mission Lab</h1>
            <p className="tag">
              Program the flight · export <code>map.db</code>
            </p>
          </div>
        </header>

        <LoadExportSection
          missionImport={props.missionImport}
          isImported={props.isImported}
          bumpFit={props.bumpFit}
          busy={props.busy}
          exportDisabled={props.exportDisabled}
          libraryCount={props.library.length}
          waypointsEmpty={props.waypointsEmpty}
          onExportMapDb={props.onExportMapDb}
          onExportGeoJSON={props.onExportGeoJSON}
          onExportChecklist={props.onExportChecklist}
          onExportProject={props.onExportProject}
          onImportProject={props.onImportProject}
        />

        <FormSection
          params={props.params}
          set={props.set}
          commit={props.commit}
          canUndo={props.canUndo}
          canRedo={props.canRedo}
          undo={props.undo}
          redo={props.redo}
          onSelectForm={props.onSelectForm}
          isImported={props.isImported}
          editAsPoints={props.editAsPoints}
          reversePoints={props.reversePoints}
          mirrorAcrossCenter={props.mirrorAcrossCenter}
          closeLoopPoints={props.closeLoopPoints}
          removeLastPoint={props.removeLastPoint}
        />

        <PositionSection
          params={props.params}
          set={props.set}
          commit={props.commit}
          bumpFit={props.bumpFit}
        />

        <MetadataSection
          name={props.name}
          setName={props.setName}
          chunkSize={props.chunkSize}
          setChunkSize={props.setChunkSize}
          heightM={props.heightM}
          setHeightM={props.setHeightM}
          speedMs={props.speedMs}
          setSpeedMs={props.setSpeedMs}
        />

        <LibrarySection
          library={props.library}
          editingId={props.editingId}
          waypointsEmpty={props.waypointsEmpty}
          onAddToLibrary={props.onAddToLibrary}
          onFitAll={props.onFitAll}
          onRename={props.onRename}
          onLoad={props.onLoad}
          onDuplicate={props.onDuplicate}
          onExportEntry={props.onExportEntry}
          onRemove={props.onRemove}
        />

        <SafetySection
          batteryMin={props.batteryMin}
          setBatteryMin={props.setBatteryMin}
          reservePct={props.reservePct}
          setReservePct={props.setReservePct}
          geofenceM={props.geofenceM}
          setGeofenceM={props.setGeofenceM}
          enduranceFrac={props.enduranceFrac}
          durationFmt={props.durationFmt}
          usableMin={props.usableMin}
          maxHomeM={props.maxHomeM}
        />

        <StatsAndValidationSection
          waypointCount={props.waypointCount}
          distanceM={props.distanceM}
          durationFmt={props.durationFmt}
          enduranceFrac={props.enduranceFrac}
          maxHomeM={props.maxHomeM}
          chunkCount={props.chunkCount}
          headingLabel={props.headingLabel}
          issues={props.issues}
          geofenceBreached={props.geofenceBreached}
          geofenceM={props.geofenceM}
          usableMin={props.usableMin}
        />

        <AnalysisSection
          trackAnalysis={props.trackAnalysis}
          distanceM={props.distanceM}
          bumpFit={props.bumpFit}
        />
      </aside>
    </div>
  );
}
