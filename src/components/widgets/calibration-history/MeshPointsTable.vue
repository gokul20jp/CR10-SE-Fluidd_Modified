<template>
  <div class="mesh-points-table">
    <v-alert
      v-if="!matrix || matrix.length === 0"
      type="info"
      dense
      outlined
    >
      No mesh data available for this entry.
    </v-alert>

    <template v-else>
      <!-- Stats Row -->
      <v-row class="mb-3">
        <v-col cols="6" sm="3">
          <v-card outlined class="text-center pa-2">
            <div class="caption grey--text">Min</div>
            <div class="font-weight-bold error--text">{{ stats.min.toFixed(4) }} mm</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card outlined class="text-center pa-2">
            <div class="caption grey--text">Max</div>
            <div class="font-weight-bold primary--text">{{ stats.max.toFixed(4) }} mm</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card outlined class="text-center pa-2">
            <div class="caption grey--text">Avg</div>
            <div class="font-weight-bold">{{ stats.avg.toFixed(4) }} mm</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card outlined class="text-center pa-2">
            <div class="caption grey--text">Range</div>
            <div
              class="font-weight-bold"
              :class="rangeClass"
            >
              {{ stats.range.toFixed(4) }} mm
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- The 7×7 Colour-Coded Table -->
      <v-card outlined>
        <v-card-title class="subtitle-2 pb-1">
          Probed Matrix — {{ rows }}×{{ cols }} points
          <v-spacer />
          <div class="d-flex align-center caption grey--text">
            <span class="mr-1" style="display:inline-block;width:12px;height:12px;background:rgba(66,165,245,0.7);border-radius:2px;" />
            High
            <span class="mx-1" style="display:inline-block;width:12px;height:12px;background:rgba(255,255,255,0.08);border-radius:2px;border:1px solid #666;" />
            Zero
            <span class="mx-1" style="display:inline-block;width:12px;height:12px;background:rgba(239,83,80,0.7);border-radius:2px;" />
            Low
          </div>
        </v-card-title>

        <div class="table-scroll-wrapper">
          <table class="mesh-table">
            <thead>
              <tr>
                <!-- Top-left corner cell: Y\X label -->
                <th class="corner-cell">Y ↓ / X →</th>
                <th
                  v-for="(xCoord, xIdx) in xCoords"
                  :key="'x-' + xIdx"
                  class="coord-header"
                >
                  {{ xCoord.toFixed(1) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <!-- Rows run from high Y to low Y (front of bed at bottom) -->
              <tr
                v-for="(row, rIdx) in displayMatrix"
                :key="'row-' + rIdx"
              >
                <td class="coord-header">{{ yCoords[rIdx].toFixed(1) }}</td>
                <td
                  v-for="(zVal, cIdx) in row"
                  :key="'cell-' + rIdx + '-' + cIdx"
                  class="mesh-cell"
                  :style="{ backgroundColor: cellBgColor(zVal) }"
                >
                  <v-tooltip bottom>
                    <template #activator="{ on, attrs }">
                      <div
                        v-bind="attrs"
                        class="cell-content"
                        :class="cellTextClass(zVal, rIdx, cIdx)"
                        v-on="on"
                      >
                        <span v-if="isMin(rIdx, cIdx)" class="cell-icon">↓</span>
                        <span v-else-if="isMax(rIdx, cIdx)" class="cell-icon">↑</span>
                        {{ zVal.toFixed(4) }}
                      </div>
                    </template>
                    <span>
                      X: {{ xCoords[cIdx].toFixed(1) }}mm, Y: {{ yCoords[rIdx].toFixed(1) }}mm<br/>
                      Z: {{ zVal.toFixed(6) }} mm
                      <span v-if="isMin(rIdx, cIdx)"> — MIN</span>
                      <span v-if="isMax(rIdx, cIdx)"> — MAX</span>
                    </span>
                  </v-tooltip>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Legend note -->
        <v-card-text class="caption grey--text pt-1">
          Y-axis: front (low Y) at bottom, rear (high Y) at top.
          X-axis: left (low X) to right (high X).
          Colors scaled to min/max of this mesh.
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'

@Component({})
export default class MeshPointsTable extends Vue {
  /**
   * The raw 7×7 (or N×M) probed_matrix from a history entry.
   * Row 0 = lowest Y (front of bed), last row = highest Y (rear).
   */
  @Prop({ type: Array, default: () => [] })
  readonly matrix!: number[][]

  /** Mesh min X coordinate (mm) */
  @Prop({ type: Number, default: 5 })
  readonly minX!: number

  /** Mesh max X coordinate (mm) */
  @Prop({ type: Number, default: 215 })
  readonly maxX!: number

  /** Mesh min Y coordinate (mm) */
  @Prop({ type: Number, default: 5 })
  readonly minY!: number

  /** Mesh max Y coordinate (mm) */
  @Prop({ type: Number, default: 215 })
  readonly maxY!: number

  get rows (): number {
    return this.matrix.length
  }

  get cols (): number {
    return this.matrix[0]?.length ?? 0
  }

  /** X coordinates for column headers */
  get xCoords (): number[] {
    if (this.cols === 0) return []
    const step = (this.maxX - this.minX) / (this.cols - 1)
    return Array.from({ length: this.cols }, (_, i) => this.minX + i * step)
  }

  /**
   * Y coordinates for row headers.
   * Displayed top-to-bottom = high Y to low Y (rear → front of bed)
   */
  get yCoords (): number[] {
    if (this.rows === 0) return []
    const step = (this.maxY - this.minY) / (this.rows - 1)
    return Array.from({ length: this.rows }, (_, i) => this.maxY - i * step)
  }

  /**
   * Matrix displayed top=high Y, bottom=low Y.
   * The raw matrix is row 0 = low Y, so we reverse.
   */
  get displayMatrix (): number[][] {
    return [...this.matrix].reverse()
  }

  get stats () {
    const flat = this.matrix.flatMap(r => r)
    const min = Math.min(...flat)
    const max = Math.max(...flat)
    const avg = flat.reduce((s, v) => s + v, 0) / flat.length
    return { min, max, avg, range: max - min }
  }

  get rangeClass (): string {
    const r = this.stats.range
    if (r < 0.15) return 'success--text'
    if (r < 0.30) return 'warning--text'
    return 'error--text'
  }

  /** Maps a Z value to a background color. Blue=high, Red=low, transparent=near zero. */
  cellBgColor (zVal: number): string {
    const { min, max } = this.stats
    const range = max - min
    if (range < 0.0001) return 'transparent'

    // Normalize: 0 = min, 1 = max
    const t = (zVal - min) / range
    // Map to blue (high) through white (mid) to red (low)
    if (t >= 0.5) {
      // High: lerp white → blue
      const alpha = (t - 0.5) * 2
      return `rgba(66, 165, 245, ${(alpha * 0.75).toFixed(2)})`
    } else {
      // Low: lerp white → red
      const alpha = (0.5 - t) * 2
      return `rgba(239, 83, 80, ${(alpha * 0.75).toFixed(2)})`
    }
  }

  cellTextClass (zVal: number, rIdx: number, cIdx: number): string {
    if (this.isMin(rIdx, cIdx) || this.isMax(rIdx, cIdx)) return 'font-weight-bold'
    return ''
  }

  /** Find min cell in displayMatrix coords */
  isMin (rIdx: number, cIdx: number): boolean {
    const { min } = this.stats
    return this.displayMatrix[rIdx][cIdx] === min
  }

  isMax (rIdx: number, cIdx: number): boolean {
    const { max } = this.stats
    return this.displayMatrix[rIdx][cIdx] === max
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
  background: transparent;
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
  background: transparent;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.cell-icon {
  font-size: 10px;
  opacity: 0.7;
}
</style>
