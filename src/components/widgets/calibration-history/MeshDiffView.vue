<template>
  <div class="mesh-diff-view">
    <v-alert
      v-if="meshEntries.length < 2"
      type="info"
      dense
      outlined
    >
      Need at least 2 mesh calibration entries to compare. Run more calibrations to see variation.
    </v-alert>

    <template v-else>
      <!-- Selectors -->
      <v-row class="mb-4" align="center">
        <v-col cols="12" sm="5">
          <v-select
            v-model="indexA"
            :items="meshSelectItems"
            label="Mesh A (baseline)"
            dense
            outlined
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="2" class="text-center">
          <v-icon color="primary">$arrowRight</v-icon>
          <div class="caption grey--text">compare</div>
        </v-col>
        <v-col cols="12" sm="5">
          <v-select
            v-model="indexB"
            :items="meshSelectItems"
            label="Mesh B (target)"
            dense
            outlined
            hide-details
          />
        </v-col>
      </v-row>

      <!-- Validation -->
      <v-alert
        v-if="indexA === indexB"
        type="warning"
        dense
        outlined
        class="mb-4"
      >
        Please select two different entries to compare.
      </v-alert>

      <!-- Summary chips -->
      <v-row v-if="diffMatrix && indexA !== indexB" class="mb-3">
        <v-col>
          <v-chip small color="success" text-color="white" class="mr-2">
            ↑ {{ improvedCount }} points improved
          </v-chip>
          <v-chip small color="error" text-color="white" class="mr-2">
            ↓ {{ regressedCount }} points regressed
          </v-chip>
          <v-chip small color="grey" text-color="white" class="mr-2">
            — {{ unchangedCount }} points unchanged
          </v-chip>
          <v-chip small class="mr-2">
            Max improvement: {{ maxImprovement.toFixed(4) }} mm
          </v-chip>
          <v-chip small>
            Max regression: {{ maxRegression.toFixed(4) }} mm
          </v-chip>
        </v-col>
      </v-row>

      <!-- Diff Table -->
      <v-card v-if="diffMatrix && indexA !== indexB" outlined class="mb-4">
        <v-card-title class="subtitle-2">
          Variation Table (B − A, per probe point)
          <v-spacer />
          <div class="d-flex align-center caption grey--text">
            <span class="mr-1" style="display:inline-block;width:12px;height:12px;background:rgba(76,175,80,0.7);border-radius:2px;" />
            Improved
            <span class="mx-1" style="display:inline-block;width:12px;height:12px;background:rgba(255,255,255,0.08);border-radius:2px;border:1px solid #666;" />
            No change
            <span class="mx-1" style="display:inline-block;width:12px;height:12px;background:rgba(239,83,80,0.7);border-radius:2px;" />
            Regressed
          </div>
        </v-card-title>

        <div class="table-scroll-wrapper">
          <table class="mesh-table">
            <thead>
              <tr>
                <th class="corner-cell">Y ↓ / X →</th>
                <th
                  v-for="(xCoord, xi) in xCoords"
                  :key="'xh-' + xi"
                  class="coord-header"
                >
                  {{ xCoord.toFixed(1) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, rIdx) in displayDiffMatrix"
                :key="'r-' + rIdx"
              >
                <td class="coord-header">{{ yCoords[rIdx].toFixed(1) }}</td>
                <td
                  v-for="(delta, cIdx) in row"
                  :key="'c-' + rIdx + '-' + cIdx"
                  class="mesh-cell"
                  :style="{ backgroundColor: diffCellBgColor(delta) }"
                >
                  <v-tooltip bottom>
                    <template #activator="{ on, attrs }">
                      <div
                        v-bind="attrs"
                        class="cell-content font-weight-medium"
                        v-on="on"
                      >
                        {{ delta >= 0 ? '+' : '' }}{{ delta.toFixed(4) }}
                      </div>
                    </template>
                    <span>
                      X: {{ xCoords[cIdx].toFixed(1) }}mm, Y: {{ yCoords[rIdx].toFixed(1) }}mm<br/>
                      Δ = {{ delta >= 0 ? '+' : '' }}{{ delta.toFixed(6) }} mm<br/>
                      A: {{ getMatrixA(rIdx, cIdx).toFixed(4) }} → B: {{ getMatrixB(rIdx, cIdx).toFixed(4) }}
                    </span>
                  </v-tooltip>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <v-card-text class="caption grey--text pt-1">
          Positive Δ = B is higher than A at this point. Negative Δ = B is lower.
          Change ≤ 0.005mm is shown as "no change".
        </v-card-text>
      </v-card>

      <!-- Side-by-side stats comparison -->
      <v-row v-if="entryA && entryB && indexA !== indexB">
        <v-col cols="12" sm="6">
          <v-card outlined>
            <v-card-title class="subtitle-2">Mesh A</v-card-title>
            <v-simple-table dense>
              <tbody>
                <tr><td class="grey--text">Timestamp</td><td>{{ formatTimestamp(entryA.timestamp) }}</td></tr>
                <tr><td class="grey--text">Range</td><td :class="rangeClass(entryA.mesh_stats.range)">{{ entryA.mesh_stats.range.toFixed(4) }} mm</td></tr>
                <tr><td class="grey--text">Min</td><td>{{ entryA.mesh_stats.min.toFixed(4) }}</td></tr>
                <tr><td class="grey--text">Max</td><td>{{ entryA.mesh_stats.max.toFixed(4) }}</td></tr>
                <tr><td class="grey--text">Avg</td><td>{{ entryA.mesh_stats.avg.toFixed(4) }}</td></tr>
                <tr><td class="grey--text">Z-Offset at save</td><td>{{ entryA.z_offset_at_save?.toFixed(4) ?? '—' }}</td></tr>
              </tbody>
            </v-simple-table>
          </v-card>
        </v-col>
        <v-col cols="12" sm="6">
          <v-card outlined>
            <v-card-title class="subtitle-2">Mesh B</v-card-title>
            <v-simple-table dense>
              <tbody>
                <tr><td class="grey--text">Timestamp</td><td>{{ formatTimestamp(entryB.timestamp) }}</td></tr>
                <tr><td class="grey--text">Range</td><td :class="rangeClass(entryB.mesh_stats.range)">{{ entryB.mesh_stats.range.toFixed(4) }} mm</td></tr>
                <tr><td class="grey--text">Min</td><td>{{ entryB.mesh_stats.min.toFixed(4) }}</td></tr>
                <tr><td class="grey--text">Max</td><td>{{ entryB.mesh_stats.max.toFixed(4) }}</td></tr>
                <tr><td class="grey--text">Avg</td><td>{{ entryB.mesh_stats.avg.toFixed(4) }}</td></tr>
                <tr><td class="grey--text">Z-Offset at save</td><td>{{ entryB.z_offset_at_save?.toFixed(4) ?? '—' }}</td></tr>
              </tbody>
            </v-simple-table>
          </v-card>
        </v-col>
      </v-row>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'
import type { MeshSaveEntry } from '@/store/calibration_history/types'

const UNCHANGED_THRESHOLD = 0.005 // mm — changes smaller than this are "unchanged"

@Component({})
export default class MeshDiffView extends Vue {
  indexA = 0
  indexB = 1

  get meshEntries (): MeshSaveEntry[] {
    return this.$store.getters['calibration_history/getMeshSaveEntries']
  }

  get meshSelectItems () {
    return this.meshEntries.map((e, idx) => ({
      value: idx,
      text: `${this.formatTimestamp(e.timestamp)} — range: ${e.mesh_stats.range.toFixed(4)}mm`
    }))
  }

  get entryA (): MeshSaveEntry | null {
    return this.meshEntries[this.indexA] ?? null
  }

  get entryB (): MeshSaveEntry | null {
    return this.meshEntries[this.indexB] ?? null
  }

  /** B - A element-wise */
  get diffMatrix (): number[][] | null {
    const a = this.entryA?.probed_matrix
    const b = this.entryB?.probed_matrix
    if (!a || !b || a.length !== b.length) return null
    return a.map((row, rIdx) =>
      row.map((val, cIdx) => (b[rIdx]?.[cIdx] ?? 0) - val)
    )
  }

  /** Reversed for display (high Y at top) */
  get displayDiffMatrix (): number[][] {
    return this.diffMatrix ? [...this.diffMatrix].reverse() : []
  }

  get rows (): number {
    return this.entryA?.probed_matrix.length ?? 0
  }

  get cols (): number {
    return this.entryA?.probed_matrix[0]?.length ?? 0
  }

  get minX (): number { return this.entryA?.mesh_stats.min_x ?? 5 }
  get maxX (): number { return this.entryA?.mesh_stats.max_x ?? 215 }
  get minY (): number { return this.entryA?.mesh_stats.min_y ?? 5 }
  get maxY (): number { return this.entryA?.mesh_stats.max_y ?? 215 }

  get xCoords (): number[] {
    const step = (this.maxX - this.minX) / (this.cols - 1)
    return Array.from({ length: this.cols }, (_, i) => this.minX + i * step)
  }

  get yCoords (): number[] {
    const step = (this.maxY - this.minY) / (this.rows - 1)
    return Array.from({ length: this.rows }, (_, i) => this.maxY - i * step)
  }

  get flat (): number[] {
    return this.diffMatrix?.flatMap(r => r) ?? []
  }

  get improvedCount (): number {
    return this.flat.filter(v => v < -UNCHANGED_THRESHOLD).length
  }

  get regressedCount (): number {
    return this.flat.filter(v => v > UNCHANGED_THRESHOLD).length
  }

  get unchangedCount (): number {
    return this.flat.filter(v => Math.abs(v) <= UNCHANGED_THRESHOLD).length
  }

  get maxImprovement (): number {
    const vals = this.flat.filter(v => v < 0)
    return vals.length > 0 ? Math.abs(Math.min(...vals)) : 0
  }

  get maxRegression (): number {
    const vals = this.flat.filter(v => v > 0)
    return vals.length > 0 ? Math.max(...vals) : 0
  }

  diffCellBgColor (delta: number): string {
    if (Math.abs(delta) <= UNCHANGED_THRESHOLD) return 'transparent'
    const absMax = Math.max(this.maxImprovement, this.maxRegression, 0.001)
    const alpha = Math.min(Math.abs(delta) / absMax, 1) * 0.75

    if (delta < 0) {
      // Improvement: bed surface got more uniform (lower variation) — green
      return `rgba(76, 175, 80, ${alpha.toFixed(2)})`
    } else {
      // Regression: red
      return `rgba(239, 83, 80, ${alpha.toFixed(2)})`
    }
  }

  // Access original matrix values in displayMatrix coords (reversed)
  getMatrixA (rIdx: number, cIdx: number): number {
    const m = this.entryA?.probed_matrix
    if (!m) return 0
    const realRow = m.length - 1 - rIdx
    return m[realRow]?.[cIdx] ?? 0
  }

  getMatrixB (rIdx: number, cIdx: number): number {
    const m = this.entryB?.probed_matrix
    if (!m) return 0
    const realRow = m.length - 1 - rIdx
    return m[realRow]?.[cIdx] ?? 0
  }

  rangeClass (range: number): string {
    if (range < 0.15) return 'success--text'
    if (range < 0.30) return 'warning--text'
    return 'error--text'
  }

  formatTimestamp (ts: string): string {
    try { return new Date(ts).toLocaleString() } catch { return ts }
  }
}
</script>

<style lang="scss" scoped>
.table-scroll-wrapper {
  overflow-x: auto;
  padding: 0 12px 12px;
}

.mesh-table {
  border-collapse: collapse;
  font-size: 12px;
  min-width: 100%;

  th, td {
    border: 1px solid rgba(128, 128, 128, 0.2);
    padding: 0;
    text-align: center;
    white-space: nowrap;
  }
}

.corner-cell {
  font-size: 10px;
  color: rgba(128, 128, 128, 0.6);
  padding: 4px 6px;
  min-width: 80px;
}

.coord-header {
  font-size: 10px;
  color: rgba(128, 128, 128, 0.8);
  padding: 4px 6px;
  min-width: 70px;
}

.mesh-cell {
  padding: 0;
  min-width: 70px;
  transition: background-color 0.2s;
}

.cell-content {
  padding: 6px 4px;
  font-family: 'Roboto Mono', monospace;
  font-size: 11px;
  cursor: default;
}
</style>
