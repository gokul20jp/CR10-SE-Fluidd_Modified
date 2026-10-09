import type { GetterTree } from 'vuex'
import type { CalibrationHistoryState, ZOffsetEntry, MeshSaveEntry, CalibrationEntry } from './types'
import type { RootState } from '../types'

export const getters = {
  /**
   * All z_offset type entries, sorted oldest first.
   */
  getZOffsetEntries: (state: CalibrationHistoryState): ZOffsetEntry[] => {
    return state.entries.filter((e): e is ZOffsetEntry => e.type === 'z_offset')
  },

  /**
   * All mesh_save type entries, sorted oldest first.
   */
  getMeshSaveEntries: (state: CalibrationHistoryState): MeshSaveEntry[] => {
    return state.entries.filter((e): e is MeshSaveEntry => e.type === 'mesh_save')
  },

  /**
   * The last recorded z_offset value.
   */
  getLastZOffset: (state: CalibrationHistoryState): number | null => {
    const offsets = state.entries.filter((e): e is ZOffsetEntry => e.type === 'z_offset')
    return offsets.length > 0 ? offsets[offsets.length - 1].z_offset : null
  },

  /**
   * The last mesh save entry.
   */
  getLastMeshSave: (state: CalibrationHistoryState): MeshSaveEntry | null => {
    const meshes = state.entries.filter((e): e is MeshSaveEntry => e.type === 'mesh_save')
    return meshes.length > 0 ? meshes[meshes.length - 1] : null
  },

  /**
   * Computes z_offset drift: difference between max and min over the last 5 z_offset entries.
   * Returns null if fewer than 3 entries.
   */
  getZOffsetDrift: (state: CalibrationHistoryState): number | null => {
    const offsets = state.entries
      .filter((e): e is ZOffsetEntry => e.type === 'z_offset')
      .slice(-5)
      .map(e => e.z_offset)

    if (offsets.length < 3) return null
    return Math.max(...offsets) - Math.min(...offsets)
  },

  /**
   * Returns true if z_offset drift exceeds the 0.05mm warning threshold.
   */
  hasDriftWarning: (state: CalibrationHistoryState, localGetters: any): boolean => {
    const drift = localGetters.getZOffsetDrift
    return drift !== null && drift > 0.05
  },

  /**
   * Total number of calibration events logged.
   */
  getTotalEntries: (state: CalibrationHistoryState): number => {
    return state.entries.length
  },

  /**
   * The 10 most recent entries (any type), newest first.
   */
  getRecentEntries: (state: CalibrationHistoryState): CalibrationEntry[] => {
    return [...state.entries].reverse().slice(0, 10)
  },

  /**
   * Returns the last calibration timestamp (from any entry type).
   */
  getLastCalibrationTime: (state: CalibrationHistoryState): string | null => {
    if (state.entries.length === 0) return null
    return state.entries[state.entries.length - 1].timestamp
  }
} satisfies GetterTree<CalibrationHistoryState, RootState>
