<template>
  <v-card outlined>
    <v-card-title class="subtitle-2 pb-1">
      Layer Time
      <v-spacer />
      <v-chip x-small class="mr-1">
        Layer {{ currentLayer }}/{{ totalLayers || '?' }}
      </v-chip>
      <v-chip x-small class="caption">
        avg {{ avgDuration.toFixed(1) }}s
      </v-chip>
    </v-card-title>

    <v-card-text class="pa-0">
      <div v-if="layerHistory.length === 0" class="px-3 py-4 grey--text caption">
        Waiting for layer data... (requires [layer_tracker] in printer.cfg)
      </div>
      <div v-else :style="{ height: chartHeight + 'px' }">
        <e-chart
          :option="chartOptions"
          :init-options="{ renderer: 'canvas' }"
          autoresize
        />
      </div>

      <!-- Anomaly chips -->
      <div
        v-if="recentAnomalies.length > 0"
        class="px-3 pb-2 d-flex flex-wrap"
        style="gap: 4px;"
      >
        <v-chip
          v-for="(a, i) in recentAnomalies"
          :key="i"
          x-small
          :color="a.severity === 'critical' ? 'error' : 'warning'"
          text-color="white"
        >
          Layer {{ a.layer }}: {{ a.ratio.toFixed(1) }}× avg
        </v-chip>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue } from 'vue-property-decorator'

@Component({})
export default class LayerTimeChart extends Vue {
  @Prop({ type: Number, default: 180 })
  readonly chartHeight!: number

  get isPrinting (): boolean {
    return this.$store.state.printer.printer.print_stats?.state === 'printing'
  }

  get layerTracker () {
    return this.$store.state.printer.printer.layer_tracker ?? {}
  }

  get currentLayer (): number {
    return this.layerTracker.current_layer ?? 0
  }

  get totalLayers (): number {
    return this.layerTracker.total_layers ?? 0
  }

  get layerHistory (): any[] {
    return this.layerTracker.layer_history ?? []
  }

  get avgDuration (): number {
    return this.layerTracker.avg_layer_duration ?? 0
  }

  get recentAnomalies (): any[] {
    return this.layerTracker.anomaly_events ?? []
  }

  get isDark (): boolean {
    return this.$store.state.config.uiSettings.theme.isDark
  }

  get chartOptions () {
    const isDark = this.isDark
    const fontColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
    const avg = this.avgDuration

    const history = this.layerHistory.slice(-60) // show last 60 layers

    const barColors = history.map(entry => {
      if (avg < 0.1) return '#2196F3'
      const ratio = entry.duration / avg
      if (ratio > 3.0) return '#f44336'   // critical — red
      if (ratio > 1.8) return '#FF9800'   // warning — orange
      return '#4CAF50'                    // normal — green
    })

    return {
      darkMode: isDark,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.9)',
        textStyle: { color: fontColor, fontSize: 11 },
        formatter: (params: any[]) => {
          const idx = params[0]?.dataIndex
          const entry = history[idx]
          if (!entry) return ''
          const ratio = avg > 0.1 ? (entry.duration / avg).toFixed(2) : '—'
          return `
            <b>Layer ${entry.layer}</b><br/>
            Z: ${entry.z} mm<br/>
            Duration: <b>${entry.duration.toFixed(1)}s</b><br/>
            vs avg: ${ratio}×<br/>
            Filament: ${entry.e_distance.toFixed(1)} mm
          `
        }
      },
      grid: { top: 8, left: 48, right: 8, bottom: 32 },
      xAxis: {
        type: 'category',
        data: history.map(e => `L${e.layer}`),
        axisLabel: { color: fontColor, fontSize: 9, rotate: 45 },
        axisLine: { lineStyle: { color: fontColor, opacity: 0.2 } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        name: 'sec',
        nameTextStyle: { color: fontColor, fontSize: 10 },
        axisLabel: { color: fontColor, fontSize: 10 },
        splitLine: { lineStyle: { color: fontColor, opacity: 0.08 } }
      },
      series: [
        {
          type: 'bar',
          name: 'Duration',
          data: history.map((e, i) => ({
            value: e.duration,
            itemStyle: { color: barColors[i] }
          })),
          barMaxWidth: 20
        },
        // Average reference line
        avg > 0.1
          ? {
              type: 'line',
              name: 'avg',
              data: history.map(() => avg),
              lineStyle: { type: 'dashed', color: 'rgba(255,255,255,0.3)', width: 1 },
              itemStyle: { opacity: 0 },
              symbol: 'none'
            }
          : null
      ].filter(Boolean)
    }
  }
}
</script>
