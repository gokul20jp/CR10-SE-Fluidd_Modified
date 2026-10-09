// Types for the calibration_history Vuex store module
// Matches the JSON schema produced by klippy/extras/calibration_history.py

export interface MeshStats {
  min: number
  max: number
  avg: number
  range: number
  x_count?: number
  y_count?: number
  min_x?: number
  max_x?: number
  min_y?: number
  max_y?: number
  algo?: string
  tension?: number
}

/** Temperature snapshot captured at the moment of any calibration event. */
export interface TempSnapshot {
  nozzle_temp?: number      // actual nozzle temperature (°C)
  nozzle_target?: number    // nozzle target temperature (°C)
  bed_temp?: number         // actual bed temperature (°C)
  bed_target?: number       // bed target temperature (°C)
}

export interface ZOffsetEntry extends TempSnapshot {
  type: 'z_offset'
  timestamp: string
  section: string
  z_offset: number
  trigger: string
}

export interface MeshSaveEntry extends TempSnapshot {
  type: 'mesh_save'
  timestamp: string
  profile: string
  z_offset_at_save: number | null
  mesh_stats: MeshStats
  probed_matrix: number[][]
  trigger: string
}

export interface ManualSnapshotEntry extends TempSnapshot {
  type: 'manual_snapshot'
  timestamp: string
  note: string
  trigger: string
  z_offset?: number
  mesh_stats?: MeshStats
  probed_matrix?: number[][]
}

export type CalibrationEntry = ZOffsetEntry | MeshSaveEntry | ManualSnapshotEntry

export interface CalibrationHistoryState {
  entries: CalibrationEntry[]
  loading: boolean
  error: string | null
  lastFetched: number | null
}
