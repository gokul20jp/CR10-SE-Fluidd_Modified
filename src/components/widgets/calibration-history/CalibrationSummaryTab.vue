<template>
  <div class="calibration-summary-tab">
    <!-- Drift Warning Alert -->
    <v-alert
      v-if="hasDriftWarning"
      type="warning"
      dense
      outlined
      class="mb-4"
      icon="$warning"
      dismissible
    >
      <strong>Z-Offset Drift Detected!</strong>
      The last 5 z_offset values varied by
      <strong>{{ (zOffsetDrift * 1000).toFixed(1) }}μm</strong>
      (threshold: 50μm).
      Consider re-cleaning the nozzle or checking the pressure sensor.
    </v-alert>

    <!-- Error shown at page level already — no duplicate needed here -->

    <!-- Stats Cards -->
    <v-row class="mb-4">
      <v-col cols="6" sm="3">
        <v-card outlined class="text-center pa-3">
          <div class="text-h5 font-weight-bold primary--text">
            {{ lastZOffset !== null ? lastZOffset.toFixed(4) : '—' }}
          </div>
          <div class="caption grey--text">Last Z-Offset (mm)</div>
        </v-card>
      </v-col>

      <v-col cols="6" sm="3">
        <v-card outlined class="text-center pa-3">
          <div
            class="text-h5 font-weight-bold"
            :class="meshRangeColor"
          >
            {{ lastMeshRange !== null ? lastMeshRange.toFixed(4) : '—' }}
          </div>
          <div class="caption grey--text">Last Mesh Range (mm)</div>
        </v-card>
      </v-col>

      <v-col cols="6" sm="3">
        <v-card outlined class="text-center pa-3">
          <div class="text-h5 font-weight-bold">
            {{ totalEntries }}
          </div>
          <div class="caption grey--text">Total Calibrations</div>
        </v-card>
      </v-col>

      <v-col cols="6" sm="3">
        <v-card outlined class="text-center pa-3">
          <div class="text-caption font-weight-medium" style="font-size: 12px !important;">
            {{ lastCalibrationTime ? formatTimestamp(lastCalibrationTime) : '—' }}
          </div>
          <div class="caption grey--text">Last Calibrated</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Z-Offset Trend Sparkline -->
    <v-card
      v-if="zOffsetEntries.length >= 2"
      outlined
      class="mb-4"
    >
      <v-card-title class="subtitle-2 pb-1">
        Z-Offset Trend
        <v-spacer />
        <v-chip
          v-if="hasDriftWarning"
          x-small
          color="warning"
          text-color="white"
          class="mr-1"
        >
          ⚠ Drifting
        </v-chip>
        <span class="caption grey--text">last {{ Math.min(zOffsetEntries.length, 10) }} readings</span>
      </v-card-title>
      <v-card-text class="pa-0 pb-2">
        <div style="height: 120px; width: 100%;">
          <e-chart
            :option="sparklineOptions"
            :init-options="{ renderer: 'canvas' }"
            autoresize
          />
        </div>
        <!-- Trend summary chips -->
        <div class="px-4 pt-1 d-flex align-center flex-wrap" style="gap: 8px;">
          <v-chip x-small>
            Min: {{ sparklineMin.toFixed(4) }} mm
          </v-chip>
          <v-chip x-small>
            Max: {{ sparklineMax.toFixed(4) }} mm
          </v-chip>
          <v-chip
            x-small
            :color="trendColor"
            text-color="white"
          >
            {{ trendLabel }}
          </v-chip>
          <v-chip
            v-if="hasDriftWarning"
            x-small
            color="warning"
            text-color="white"
          >
            Drift: {{ zOffsetDrift !== null ? (zOffsetDrift * 1000).toFixed(1) : '—' }}μm
          </v-chip>
        </div>
      </v-card-text>
    </v-card>

    <!-- Quick Actions -->
    <v-row class="mb-4">
      <v-col cols="12">
        <v-card outlined>
          <v-card-title class="subtitle-2 pb-1">
            Quick Actions
            <v-spacer />
            <!-- Klipper not ready indicator -->
            <v-chip
              v-if="!klippyReady"
              x-small
              color="warning"
              text-color="white"
            >
              Klipper not ready
            </v-chip>
          </v-card-title>
          <v-card-text>
            <v-tooltip bottom :disabled="klippyReady && !printerBusy">
              <template #activator="{ on, attrs }">
                <v-row v-bind="attrs" v-on="on">
                  <v-col cols="12" sm="4">
                    <v-btn
                      block
                      small
                      color="primary"
                      :disabled="printerBusy || !klippyReady"
                      @click="runFullCalibration()"
                    >
                      <v-icon small left>$bedMesh</v-icon>
                      Full Calibration
                    </v-btn>
                  </v-col>
                  <v-col cols="12" sm="4">
                    <v-btn
                      block
                      small
                      :disabled="printerBusy || !klippyReady"
                      @click="runZOffsetOnly()"
                    >
                      Z-Offset Only
                    </v-btn>
                  </v-col>
                  <v-col cols="12" sm="4">
                    <v-btn
                      block
                      small
                      color="error"
                      :loading="loading"
                      @click="confirmClearHistory()"
                    >
                      <v-icon small left>$delete</v-icon>
                      Clear History
                    </v-btn>
                  </v-col>
                </v-row>
              </template>
              <span v-if="!klippyReady">Klipper is not ready — cannot send GCode commands</span>
              <span v-else-if="printerBusy">Printer is busy — wait for current operation to finish</span>
            </v-tooltip>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <!-- Recent Calibration Log -->
    <v-card outlined>
      <v-card-title class="subtitle-2">
        Recent Calibration Log
        <v-spacer />
        <v-btn
          icon
          small
          :loading="loading"
          @click="refresh()"
        >
          <v-icon small>$refresh</v-icon>
        </v-btn>
      </v-card-title>

      <v-simple-table dense>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Type</th>
            <th>Trigger</th>
            <th>Z-Offset</th>
            <th>Mesh Range</th>
            <th>Nozzle</th>
            <th>Bed</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(entry, idx) in recentEntries"
            :key="idx"
          >
            <td class="text-no-wrap">{{ formatTimestamp(entry.timestamp) }}</td>
            <td>
              <v-chip
                x-small
                :color="entryTypeColor(entry.type)"
                text-color="white"
              >
                {{ entry.type }}
              </v-chip>
            </td>
            <td class="caption">{{ entry.trigger }}</td>
            <td class="focus--text font-weight-medium">
              {{ getZOffset(entry) !== null ? getZOffset(entry).toFixed(4) + ' mm' : '—' }}
            </td>
            <td :class="entry.type === 'mesh_save' ? meshRangeClass(entry) : ''">
              {{ getMeshRange(entry) !== null ? getMeshRange(entry).toFixed(4) + ' mm' : '—' }}
            </td>
            <td class="caption">
              <span v-if="entry.nozzle_temp !== undefined">
                {{ entry.nozzle_temp.toFixed(0) }}°C
              </span>
              <span v-else class="grey--text">—</span>
            </td>
            <td class="caption">
              <span v-if="entry.bed_temp !== undefined">
                {{ entry.bed_temp.toFixed(0) }}°C
              </span>
              <span v-else class="grey--text">—</span>
            </td>
            <td class="caption grey--text">{{ getNote(entry) }}</td>
          </tr>
          <tr v-if="recentEntries.length === 0">
            <td colspan="8" class="text-center grey--text pa-4">
              No calibration history yet. Run a calibration to get started.
            </td>
          </tr>
        </tbody>
      </v-simple-table>
    </v-card>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import type { CalibrationEntry, ZOffsetEntry, MeshSaveEntry, ManualSnapshotEntry } from '@/store/calibration_history/types'

@Component({})
export default class CalibrationSummaryTab extends Mixins(StateMixin) {

  get loading (): boolean {
    return this.$store.state.calibration_history.loading
  }

  get error (): string | null {
    return this.$store.state.calibration_history.error
  }

  get lastZOffset (): number | null {
    return this.$store.getters['calibration_history/getLastZOffset']
  }

  get lastMeshRange (): number | null {
    const last = this.$store.getters['calibration_history/getLastMeshSave'] as MeshSaveEntry | null
    return last?.mesh_stats?.range ?? null
  }

  get totalEntries (): number {
    return this.$store.getters['calibration_history/getTotalEntries']
  }

  get lastCalibrationTime (): string | null {
    return this.$store.getters['calibration_history/getLastCalibrationTime']
  }

  get recentEntries (): CalibrationEntry[] {
    return this.$store.getters['calibration_history/getRecentEntries']
  }

  get hasDriftWarning (): boolean {
    return this.$store.getters['calibration_history/hasDriftWarning']
  }

  get zOffsetDrift (): number | null {
    return this.$store.getters['calibration_history/getZOffsetDrift']
  }

  // ── Sparkline data ──────────────────────────────────────────────────

  get zOffsetEntries (): ZOffsetEntry[] {
    return this.$store.getters['calibration_history/getZOffsetEntries']
  }

  /** Last 10 z_offset readings for the sparkline */
  get sparklineEntries (): ZOffsetEntry[] {
    return this.zOffsetEntries.slice(-10)
  }

  get sparklineValues (): number[] {
    return this.sparklineEntries.map(e => e.z_offset)
  }

  get sparklineMin (): number {
    return this.sparklineValues.length ? Math.min(...this.sparklineValues) : 0
  }

  get sparklineMax (): number {
    return this.sparklineValues.length ? Math.max(...this.sparklineValues) : 0
  }

  get isDark (): boolean {
    return this.$store.state.config.uiSettings.theme.isDark
  }

  /** Overall trend: compare first half avg vs second half avg */
  get trendLabel (): string {
    const vals = this.sparklineValues
    if (vals.length < 4) return 'Not enough data'
    const half = Math.floor(vals.length / 2)
    const firstAvg = vals.slice(0, half).reduce((s, v) => s + v, 0) / half
    const secondAvg = vals.slice(half).reduce((s, v) => s + v, 0) / (vals.length - half)
    const diff = secondAvg - firstAvg
    if (Math.abs(diff) < 0.002) return '● Stable'
    return diff > 0 ? '↑ Rising (+' + (diff * 1000).toFixed(1) + 'μm)' : '↓ Falling (' + (diff * 1000).toFixed(1) + 'μm)'
  }

  get trendColor (): string {
    const vals = this.sparklineValues
    if (vals.length < 4) return 'grey'
    const half = Math.floor(vals.length / 2)
    const firstAvg = vals.slice(0, half).reduce((s, v) => s + v, 0) / half
    const secondAvg = vals.slice(half).reduce((s, v) => s + v, 0) / (vals.length - half)
    const diff = Math.abs(secondAvg - firstAvg)
    if (diff < 0.002) return 'green'
    if (diff < 0.010) return 'orange'
    return 'red'
  }

  get sparklineOptions () {
    const isDark = this.isDark
    const fontColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
    const lineColor = this.hasDriftWarning ? '#FF9800' : '#2196F3'
    const areaColor = this.hasDriftWarning
      ? 'rgba(255, 152, 0, 0.12)'
      : 'rgba(33, 150, 243, 0.10)'

    const vals = this.sparklineValues
    const entries = this.sparklineEntries

    // Compute y-axis range with a small padding so the line doesn't hug edges
    const yMin = vals.length ? Math.min(...vals) - 0.005 : 0
    const yMax = vals.length ? Math.max(...vals) + 0.005 : 0.01

    return {
      darkMode: isDark,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Roboto', color: fontColor },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#444' : '#ddd',
        textStyle: { color: fontColor, fontSize: 12 },
        formatter: (params: any[]) => {
          const idx = params[0]?.dataIndex
          if (idx == null || !entries[idx]) return ''
          const e = entries[idx]
          return `
            <b>${new Date(e.timestamp).toLocaleString()}</b><br/>
            Z-Offset: <b>${e.z_offset.toFixed(6)} mm</b><br/>
            Trigger: ${e.trigger}
          `
        }
      },
      grid: { top: 8, left: 52, right: 8, bottom: 24 },
      xAxis: {
        type: 'category',
        data: entries.map((_, i) => String(i + 1)),
        axisLabel: { show: false },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
        axisLabel: {
          color: fontColor,
          fontSize: 10,
          formatter: (v: number) => v.toFixed(3)
        },
        splitLine: { lineStyle: { color: fontColor, opacity: 0.08 } }
      },
      series: [{
        type: 'line',
        data: vals,
        smooth: false,
        showSymbol: true,
        symbolSize: 5,
        lineStyle: { color: lineColor, width: 2 },
        itemStyle: { color: lineColor },
        areaStyle: { color: areaColor },
        // Mark the min/max points
        markPoint: {
          data: [
            { type: 'max', name: 'Max', label: { formatter: (p: any) => p.value.toFixed(4), fontSize: 10, color: fontColor } },
            { type: 'min', name: 'Min', label: { formatter: (p: any) => p.value.toFixed(4), fontSize: 10, color: fontColor } }
          ],
          symbol: 'circle',
          symbolSize: 8
        }
      }]
    }
  }

  get meshRangeColor (): string {
    if (this.lastMeshRange === null) return ''
    if (this.lastMeshRange < 0.15) return 'success--text'
    if (this.lastMeshRange < 0.30) return 'warning--text'
    return 'error--text'
  }

  meshRangeClass (entry: MeshSaveEntry): string {
    const r = entry.mesh_stats?.range
    if (!r) return ''
    if (r < 0.15) return 'success--text'
    if (r < 0.30) return 'warning--text'
    return 'error--text'
  }

  entryTypeColor (type: string): string {
    switch (type) {
      case 'z_offset': return 'blue'
      case 'mesh_save': return 'green'
      case 'manual_snapshot': return 'purple'
      default: return 'grey'
    }
  }

  getZOffset (entry: CalibrationEntry): number | null {
    if (entry.type === 'z_offset') return (entry as ZOffsetEntry).z_offset
    if (entry.type === 'mesh_save') return (entry as MeshSaveEntry).z_offset_at_save
    if (entry.type === 'manual_snapshot') return (entry as ManualSnapshotEntry).z_offset ?? null
    return null
  }

  getMeshRange (entry: CalibrationEntry): number | null {
    if (entry.type === 'mesh_save') return (entry as MeshSaveEntry).mesh_stats?.range ?? null
    if (entry.type === 'manual_snapshot') return (entry as ManualSnapshotEntry).mesh_stats?.range ?? null
    return null
  }

  getNote (entry: CalibrationEntry): string {
    if (entry.type === 'manual_snapshot') return (entry as ManualSnapshotEntry).note ?? ''
    if (entry.type === 'mesh_save') return (entry as MeshSaveEntry).profile
    return ''
  }

  formatTimestamp (ts: string): string {
    try {
      const d = new Date(ts)
      return d.toLocaleString()
    } catch {
      return ts
    }
  }

  async refresh () {
    await this.$store.dispatch('calibration_history/fetchHistory')
  }

  runFullCalibration () {
    this.sendGcode('CX_PRINT_LEVELING_CALIBRATION LEVELING_CALIBRATION=1')
  }

  runZOffsetOnly () {
    this.sendGcode('Z_OFFSET_TEST')
  }

  async confirmClearHistory () {
    const ok = await this.$confirm(
      'This will permanently delete all calibration history entries. Are you sure?',
      { title: 'Clear Calibration History', color: 'error', icon: '$error' }
    )
    if (ok) {
      await this.$store.dispatch('calibration_history/clearHistory')
    }
  }
}
</script>
