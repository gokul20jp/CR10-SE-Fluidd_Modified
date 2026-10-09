<template>
  <div class="mesh-history-viewer">
    <!-- Empty state -->
    <v-alert
      v-if="meshEntries.length === 0"
      type="info"
      dense
      outlined
    >
      No mesh history recorded yet. Run a bed mesh calibration to see data here.
    </v-alert>

    <template v-else>
      <!-- Entry Selector -->
      <v-row class="mb-3" align="center">
        <v-col cols="12" sm="8">
          <v-select
            v-model="selectedIndex"
            :items="meshSelectItems"
            label="Select Calibration Entry"
            dense
            outlined
            hide-details
          />
        </v-col>
        <v-col cols="12" sm="4">
          <v-card outlined class="pa-2 text-center">
            <div class="caption grey--text">Mesh Range</div>
            <div
              class="text-h6 font-weight-bold"
              :class="rangeClass"
            >
              {{ selectedEntry ? selectedEntry.mesh_stats.range.toFixed(4) + ' mm' : '—' }}
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Mesh stats bar -->
      <v-row v-if="selectedEntry" class="mb-3">
        <v-col cols="6" sm="3">
          <v-card outlined class="pa-2 text-center">
            <div class="caption grey--text">Min Z</div>
            <div class="font-weight-bold error--text">{{ selectedEntry.mesh_stats.min.toFixed(4) }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card outlined class="pa-2 text-center">
            <div class="caption grey--text">Max Z</div>
            <div class="font-weight-bold primary--text">{{ selectedEntry.mesh_stats.max.toFixed(4) }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card outlined class="pa-2 text-center">
            <div class="caption grey--text">Avg Z</div>
            <div class="font-weight-bold">{{ selectedEntry.mesh_stats.avg.toFixed(4) }}</div>
          </v-card>
        </v-col>
        <v-col cols="6" sm="3">
          <v-card outlined class="pa-2 text-center">
            <div class="caption grey--text">Algorithm</div>
            <div class="font-weight-bold">{{ selectedEntry.mesh_stats.algo ?? 'bicubic' }}</div>
          </v-card>
        </v-col>
      </v-row>

      <!-- 3D Chart — reuses BedMeshChart directly -->
      <v-card outlined class="mb-4">
        <v-card-title class="subtitle-2">
          3D Mesh Surface
          <v-spacer />
          <span class="caption grey--text mr-3">
            Z-Offset at save:
            <b>{{ selectedEntry && selectedEntry.z_offset_at_save !== null ? selectedEntry.z_offset_at_save.toFixed(4) + ' mm' : '—' }}</b>
          </span>
          <v-btn
            text
            x-small
            class="caption"
            @click="wireframe = !wireframe"
          >
            {{ wireframe ? 'Hide Wireframe' : 'Show Wireframe' }}
          </v-btn>
        </v-card-title>

        <v-card-text
          v-if="matrixValidationError"
          class="pa-4"
        >
          <v-alert type="warning" dense outlined>
            <v-icon left small>$warning</v-icon>
            {{ matrixValidationError }}
          </v-alert>
        </v-card-text>
        <v-card-text class="pa-0" v-else-if="chartData && chartData.coordinates && chartData.coordinates.length > 0">
          <bed-mesh-chart
            ref="meshChart"
            :data="chartSeriesData"
            :options="chartOptions"
            :graphics="chartGraphics"
            :height="isMobileViewport ? 260 : 480"
          />
        </v-card-text>
        <v-card-text v-else class="pa-4 grey--text text-center">
          <v-icon class="mb-2" color="grey">$bedMesh</v-icon>
          <div>No 3D mesh data available for this entry.</div>
          <div class="caption mt-1">The probed_matrix may be missing or too small to render.</div>
        </v-card-text>
      </v-card>

      <!-- Point Table embedded below the chart -->
      <mesh-points-table
        v-if="selectedEntry"
        :matrix="selectedEntry.probed_matrix"
        :min-x="selectedEntry.mesh_stats.min_x ?? 5"
        :max-x="selectedEntry.mesh_stats.max_x ?? 215"
        :min-y="selectedEntry.mesh_stats.min_y ?? 5"
        :max-y="selectedEntry.mesh_stats.max_y ?? 215"
      />
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Vue, Ref } from 'vue-property-decorator'
import BedMeshChart from '@/components/widgets/bedmesh/BedMeshChart.vue'
import MeshPointsTable from './MeshPointsTable.vue'
import type { MeshSaveEntry } from '@/store/calibration_history/types'
import { transformMesh } from '@/util/transform-mesh'

@Component({
  components: { BedMeshChart, MeshPointsTable }
})
export default class MeshHistoryViewer extends Vue {
  selectedIndex = 0
  wireframe = false

  @Ref('meshChart')
  readonly meshChart?: any

  get meshEntries (): MeshSaveEntry[] {
    return this.$store.getters['calibration_history/getMeshSaveEntries']
  }

  get meshSelectItems () {
    return this.meshEntries.map((e, idx) => ({
      value: idx,
      text: `${this.formatTimestamp(e.timestamp)} — ${e.profile} (range: ${e.mesh_stats.range.toFixed(4)}mm)`
    }))
  }

  get selectedEntry (): MeshSaveEntry | null {
    return this.meshEntries[this.selectedIndex] ?? null
  }

  get isMobileViewport (): boolean {
    return this.$vuetify.breakpoint.mobile
  }

  get isDark (): boolean {
    return this.$store.state.config.uiSettings.theme.isDark
  }

  get rangeClass (): string {
    const r = this.selectedEntry?.mesh_stats.range
    if (!r) return ''
    if (r < 0.15) return 'success--text'
    if (r < 0.30) return 'warning--text'
    return 'error--text'
  }

  /** Build a synthetic BedMeshState-compatible object for transformMesh */
  get syntheticBedMesh () {
    const entry = this.selectedEntry
    if (!entry) return null
    if (!entry.probed_matrix || !Array.isArray(entry.probed_matrix) || entry.probed_matrix.length === 0) return null
    if (!Array.isArray(entry.probed_matrix[0]) || entry.probed_matrix[0].length === 0) return null

    return {
      probed_matrix: entry.probed_matrix,
      mesh_matrix: entry.probed_matrix,
      mesh_min: [
        entry.mesh_stats?.min_x ?? 5,
        entry.mesh_stats?.min_y ?? 5
      ] as [number, number],
      mesh_max: [
        entry.mesh_stats?.max_x ?? 215,
        entry.mesh_stats?.max_y ?? 215
      ] as [number, number],
      profile_name: entry.profile
    }
  }

  get matrixValidationError (): string | null {
    const entry = this.selectedEntry
    if (!entry) return null
    if (!entry.probed_matrix) return 'No probed_matrix data in this history entry.'
    if (!Array.isArray(entry.probed_matrix) || entry.probed_matrix.length === 0)
      return 'probed_matrix is empty or malformed.'
    if (!Array.isArray(entry.probed_matrix[0]))
      return 'probed_matrix rows are not arrays. Data may be corrupted.'
    const rows = entry.probed_matrix.length
    const cols = entry.probed_matrix[0].length
    if (rows < 2 || cols < 2)
      return `Mesh is too small to display (${rows}×${cols}). Minimum is 2×2.`
    return null
  }

  get chartData () {
    const mesh = this.syntheticBedMesh
    if (!mesh) return null
    return transformMesh(mesh as any, 'probed_matrix')
  }

  get chartSeriesData () {
    const data = this.chartData
    if (!data || data.coordinates.length === 0) return []
    return [
      {
        type: 'surface',
        name: 'probed_matrix',
        shading: 'color',
        wireframe: { show: this.wireframe },
        data: data.coordinates,
        dataShape: data.dimensions
      }
    ]
  }

  get chartOptions () {
    const data = this.chartData
    if (!data) return {}

    const zMin = data.min
    const zMax = data.max
    const range = data.range

    return {
      visualMap: {
        min: zMin - range * 0.1,
        max: zMax + range * 0.1,
        dimension: 2,
        seriesIndex: 0
      },
      zAxis3D: {
        min: data.mid - Math.max(range, 0.1),
        max: data.mid + Math.max(range, 0.1)
      }
    }
  }

  get chartGraphics () {
    const data = this.chartData
    if (!data) return []
    return [{
      type: 'text',
      right: 10,
      top: 0,
      z: 100,
      silent: true,
      style: {
        text: `Range: ${data.range.toFixed(4)} mm`
      }
    }]
  }

  formatTimestamp (ts: string): string {
    try { return new Date(ts).toLocaleString() } catch { return ts }
  }
}
</script>
