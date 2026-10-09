<template>
  <div class="z-offset-history-tab">
    <v-row v-if="zOffsetEntries.length === 0">
      <v-col class="text-center py-8">
        <v-icon size="56" color="grey darken-1" class="mb-4">$bedMesh</v-icon>
        <div class="text-subtitle-1 grey--text font-weight-medium">No Z-Offset History Yet</div>
        <div class="caption grey--text mt-1 mb-4">
          Z-offset values are automatically recorded each time<br/>
          a calibration is run via <code>Z_OFFSET_CALIBRATION</code> or <code>Z_OFFSET_AUTO</code>.
        </div>
        <v-btn
          small
          color="primary"
          :disabled="!klippyReady || printerBusy"
          @click="sendGcode('G29')"
        >
          <v-icon small left>$bedMesh</v-icon>
          Run Calibration (G29)
        </v-btn>
      </v-col>
    </v-row>

    <template v-else>
      <!-- Chart -->
      <v-card outlined class="mb-4">
        <v-card-title class="subtitle-2">
          Z-Offset Over Time
          <v-spacer />
          <v-chip
            v-if="hasDriftWarning"
            small
            color="warning"
            text-color="white"
            class="mr-2"
          >
            ⚠ Drift {{ (drift * 1000).toFixed(1) }}μm
          </v-chip>
          <v-chip
            v-if="!hasDriftWarning && zOffsetEntries.length >= 2"
            small
            color="success"
            text-color="white"
            class="mr-2"
          >
            ✓ Stable
          </v-chip>
          <span class="caption grey--text">{{ zOffsetEntries.length }} readings</span>
        </v-card-title>
        <!-- Flat line notice when all values are identical -->
        <v-alert
          v-if="isAllSameValue"
          type="success"
          dense
          text
          class="mx-3 mb-0 mt-0"
        >
          All {{ zOffsetEntries.length }} readings are identical at
          <strong>{{ zOffsetEntries[0].z_offset.toFixed(4) }} mm</strong>.
          The flat line is correct — your Z-offset is perfectly stable.
        </v-alert>
        <v-card-text class="pa-0">
          <div style="height: 320px; width: 100%;">
            <e-chart
              :option="chartOptions"
              :init-options="{ renderer: 'canvas' }"
              autoresize
            />
          </div>
        </v-card-text>
      </v-card>

      <!-- Z-Offset Table -->
      <v-card outlined>
        <v-card-title class="subtitle-2">Z-Offset History Table</v-card-title>
        <v-simple-table dense>
          <thead>
            <tr>
              <th>#</th>
              <th>Timestamp</th>
              <th>Z-Offset (mm)</th>
              <th>Section</th>
              <th>Trigger</th>
              <th>Δ from prev</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(entry, idx) in zOffsetEntries"
              :key="idx"
            >
              <td class="grey--text">{{ idx + 1 }}</td>
              <td class="text-no-wrap caption">{{ formatTimestamp(entry.timestamp) }}</td>
              <td class="font-weight-bold focus--text">{{ entry.z_offset.toFixed(6) }}</td>
              <td class="caption">{{ entry.section }}</td>
              <td>
                <v-chip
                  x-small
                  :color="triggerColor(entry.trigger)"
                  text-color="white"
                >
                  {{ formatTrigger(entry.trigger) }}
                </v-chip>
              </td>
              <td :class="deltaClass(idx)">
                {{ getDelta(idx) }}
              </td>
            </tr>
          </tbody>
        </v-simple-table>
      </v-card>
    </template>
  </div>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import StateMixin from '@/mixins/state'
import type { ZOffsetEntry } from '@/store/calibration_history/types'

const DRIFT_THRESHOLD = 0.05 // mm

@Component({})
export default class ZOffsetHistoryChart extends Mixins(StateMixin) {

  get zOffsetEntries (): ZOffsetEntry[] {
    return this.$store.getters['calibration_history/getZOffsetEntries']
  }

  get hasDriftWarning (): boolean {
    return this.$store.getters['calibration_history/hasDriftWarning']
  }

  get drift (): number | null {
    return this.$store.getters['calibration_history/getZOffsetDrift']
  }

  get isDark (): boolean {
    return this.$store.state.config.uiSettings.theme.isDark
  }

  get fontColor (): string {
    return this.isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.55)'
  }

  get isAllSameValue (): boolean {
    const entries = this.zOffsetEntries
    if (entries.length < 2) return false
    const first = entries[0].z_offset
    return entries.every(e => Math.abs(e.z_offset - first) < 0.0001)
  }

  /** True if any entry has temperature data */
  get hasTemperatureData (): boolean {
    return this.zOffsetEntries.some(e => e.nozzle_temp !== undefined || e.bed_temp !== undefined)
  }

  get chartOptions () {
    const entries = this.zOffsetEntries
    const isDark = this.isDark
    const fontColor = this.fontColor
    const hasTemp = this.hasTemperatureData

    // Build Z-offset series per trigger type
    const triggerTypes = [...new Set(entries.map(e => e.trigger))]
    const colorMap: Record<string, string> = {
      'configfile.set': '#2196F3',
      'G29': '#4CAF50',
      'CX_PRINT_LEVELING_CALIBRATION': '#FF9800',
      'manual': '#9C27B0'
    }

    const xLabels = entries.map(e => this.formatTimestampShort(e.timestamp))

    const zOffsetSeries = triggerTypes.map(trigger => {
      const data = entries.map((e, idx) =>
        e.trigger === trigger ? { value: e.z_offset, idx } : { value: null, idx }
      )
      return {
        name: trigger,
        type: 'line',
        yAxisIndex: 0,
        smooth: false,
        showAllSymbol: true,
        symbolSize: 7,
        data: data.map(d => d.value),
        color: colorMap[trigger] ?? '#78909C',
        lineStyle: { width: 2 },
        itemStyle: { color: colorMap[trigger] ?? '#78909C' },
        connectNulls: false
      }
    })

    // Temperature overlay series (right Y axis)
    const tempSeries = hasTemp
      ? [
          {
            name: '🔥 Nozzle (°C)',
            type: 'line',
            yAxisIndex: 1,
            data: entries.map(e => e.nozzle_temp ?? null),
            symbol: 'none',
            lineStyle: { color: '#FF5722', width: 1.5, type: 'dashed' },
            itemStyle: { color: '#FF5722' }
          },
          {
            name: '🛏 Bed (°C)',
            type: 'line',
            yAxisIndex: 1,
            data: entries.map(e => e.bed_temp ?? null),
            symbol: 'none',
            lineStyle: { color: '#2196F3', width: 1.5, type: 'dashed' },
            itemStyle: { color: '#2196F3' }
          }
        ]
      : []

    // Drift mark area
    const values = entries.map(e => e.z_offset)
    const allMin = Math.min(...values)
    const allMax = Math.max(...values)
    const driftMarkLine = this.hasDriftWarning && entries.length >= 2
      ? [{ type: 'average', name: 'avg', lineStyle: { type: 'dashed', color: 'rgba(255, 152, 0, 0.7)', width: 1 }, label: { formatter: 'avg: {c}', color: fontColor, fontSize: 11 } }]
      : []

    return {
      darkMode: isDark,
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Roboto', color: fontColor },
      legend: {
        show: true,
        bottom: 0,
        textStyle: { color: fontColor, fontSize: 11 }
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.9)',
        borderColor: isDark ? '#444' : '#ccc',
        textStyle: { color: fontColor, fontSize: 12 },
        formatter: (params: any[]) => {
          const idx = params[0]?.dataIndex
          const entry = entries[idx]
          if (!entry) return ''
          let html = `<b>${this.formatTimestamp(entry.timestamp)}</b><br/>`
          html += `Z-Offset: <b>${entry.z_offset.toFixed(6)} mm</b><br/>`
          html += `Section: ${entry.section} | Trigger: ${this.formatTrigger(entry.trigger)}<br/>`
          if (entry.nozzle_temp !== undefined) html += `🔥 Nozzle: <b>${entry.nozzle_temp.toFixed(1)}°C</b>`
          if (entry.nozzle_target !== undefined) html += ` / ${entry.nozzle_target.toFixed(0)}°C target<br/>`
          if (entry.bed_temp !== undefined) html += `🛏 Bed: <b>${entry.bed_temp.toFixed(1)}°C</b>`
          if (entry.bed_target !== undefined) html += ` / ${entry.bed_target.toFixed(0)}°C target`
          return html
        }
      },
      grid: { top: 16, left: 60, right: hasTemp ? 52 : 20, bottom: 48 },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { color: fontColor, fontSize: 10, rotate: 30 },
        axisLine: { lineStyle: { color: fontColor, opacity: 0.3 } }
      },
      yAxis: [
        {
          type: 'value',
          name: 'Z-Offset (mm)',
          nameTextStyle: { color: fontColor, fontSize: 11 },
          min: (v: any) => {
            const spread = v.max - v.min
            const pad = spread < 0.001 ? 0.05 : 0.02
            return parseFloat((v.min - pad).toFixed(3))
          },
          max: (v: any) => {
            const spread = v.max - v.min
            const pad = spread < 0.001 ? 0.05 : 0.02
            return parseFloat((v.max + pad).toFixed(3))
          },
          axisLabel: { color: fontColor, fontSize: 11, formatter: (v: number) => v.toFixed(3) },
          splitLine: { lineStyle: { color: fontColor, opacity: 0.1 } }
        },
        ...(hasTemp ? [{
          type: 'value',
          name: '°C',
          nameTextStyle: { color: fontColor, fontSize: 10 },
          axisLabel: { color: fontColor, fontSize: 10, formatter: (v: number) => v.toFixed(0) + '°' },
          splitLine: { show: false }
        }] : [])
      ],
      series: [
        ...zOffsetSeries.map(s => ({
          ...s,
          markLine: { silent: true, data: driftMarkLine },
          markArea: this.hasDriftWarning
            ? { silent: true, itemStyle: { color: 'rgba(255, 152, 0, 0.06)' }, data: [[{ yAxis: allMin }, { yAxis: allMax }]] }
            : undefined
        })),
        ...tempSeries
      ]
    }
  }

  formatTimestamp (ts: string): string {
    try { return new Date(ts).toLocaleString() } catch { return ts }
  }

  formatTimestampShort (ts: string): string {
    try {
      const d = new Date(ts)
      return `${d.toLocaleDateString()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
    } catch { return ts }
  }

  formatTrigger (trigger: string): string {
    const map: Record<string, string> = {
      'configfile.set': 'auto',
      'CX_PRINT_LEVELING_CALIBRATION': 'print',
      'G29': 'G29',
      'manual': 'manual'
    }
    return map[trigger] ?? trigger
  }

  triggerColor (trigger: string): string {
    const map: Record<string, string> = {
      'configfile.set': 'blue',
      'G29': 'green',
      'CX_PRINT_LEVELING_CALIBRATION': 'orange darken-1',
      'manual': 'purple'
    }
    return map[trigger] ?? 'grey'
  }

  getDelta (idx: number): string {
    if (idx === 0) return '—'
    const curr = this.zOffsetEntries[idx].z_offset
    const prev = this.zOffsetEntries[idx - 1].z_offset
    const delta = curr - prev
    return (delta >= 0 ? '+' : '') + delta.toFixed(4)
  }

  deltaClass (idx: number): string {
    if (idx === 0) return 'grey--text'
    const curr = this.zOffsetEntries[idx].z_offset
    const prev = this.zOffsetEntries[idx - 1].z_offset
    const delta = curr - prev
    if (Math.abs(delta) < 0.001) return 'grey--text'
    return delta > 0 ? 'warning--text' : 'success--text'
  }
}
</script>
