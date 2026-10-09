<template>
  <v-card outlined>
    <v-card-title class="subtitle-2 pb-1">
      Z-Offset Live Watch
      <v-spacer />
      <v-chip x-small class="mr-1">
        Current: <b class="ml-1">{{ currentZOffset.toFixed(4) }} mm</b>
      </v-chip>
      <v-chip
        v-if="driftFromStart !== null && Math.abs(driftFromStart) > 0.001"
        x-small
        :color="Math.abs(driftFromStart) > 0.05 ? 'error' : 'warning'"
        text-color="white"
      >
        Δ {{ driftFromStart > 0 ? '+' : '' }}{{ (driftFromStart * 1000).toFixed(1) }}μm
      </v-chip>
    </v-card-title>

    <v-card-text class="pa-0" style="position: relative;">
      <div
        v-if="samples.length < 2"
        class="grey--text caption text-center py-5"
      >
        Waiting for Z-offset changes...<br/>
        <span style="font-size:10px;">tracked from <code>gcode_move.homing_origin</code></span>
      </div>
      <div v-show="samples.length >= 2" :style="{ height: chartHeight + 'px' }">
        <e-chart
          ref="chart"
          :option="chartOptions"
          :update-options="updateOptions"
          :init-options="initOptions"
          autoresize
        />
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch, Ref } from 'vue-property-decorator'
import type { ECharts, EChartsInitOpts, SetOptionOpts } from 'echarts'

const MAX_SAMPLES = 300

interface ZSample { time: string; value: number }

@Component({})
export default class LiveZOffsetChart extends Vue {
  @Prop({ type: Number, default: 160 })
  readonly chartHeight!: number

  @Ref('chart') readonly chartRef?: ECharts

  readonly updateOptions: SetOptionOpts = Object.freeze({ notMerge: false, lazyUpdate: true })
  readonly initOptions: EChartsInitOpts = Object.freeze({ renderer: 'canvas' })

  samples: ZSample[] = []
  startValue: number | null = null

  get currentZOffset (): number {
    return this.$store.state.printer.printer.gcode_move?.homing_origin?.[2] ?? 0
  }
  get isDark (): boolean { return this.$store.state.config.uiSettings.theme.isDark }

  get driftFromStart (): number | null {
    if (this.startValue === null || this.samples.length === 0) return null
    return this.currentZOffset - this.startValue
  }

  get chartOptions () {
    const isDark = this.isDark
    const fc = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
    const samples = this.samples
    const startVal = this.startValue ?? (samples[0]?.value ?? 0)
    const vals = samples.map(s => s.value)
    const yMin = vals.length ? Math.min(...vals) - 0.005 : startVal - 0.05
    const yMax = vals.length ? Math.max(...vals) + 0.005 : startVal + 0.05

    return {
      animation: false,
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.9)',
        textStyle: { color: fc, fontSize: 11 },
        formatter: (params: any[]) => {
          const s = samples[params[0]?.dataIndex]
          if (!s) return ''
          const delta = this.startValue !== null ? s.value - this.startValue : 0
          return `<b>${s.time}</b><br/>Z-Offset: <b>${s.value.toFixed(6)} mm</b><br/>Δ: ${delta >= 0 ? '+' : ''}${(delta * 1000).toFixed(1)}μm`
        }
      },
      grid: { top: 16, left: 60, right: 16, bottom: 24 },
      xAxis: { type: 'category', data: samples.map(s => s.time), axisLabel: { show: false }, axisLine: { lineStyle: { color: fc, opacity: 0.2 } }, axisTick: { show: false } },
      yAxis: {
        type: 'value', name: 'mm', min: yMin, max: yMax,
        nameTextStyle: { color: fc, fontSize: 10 },
        axisLabel: { color: fc, fontSize: 10, formatter: (v: number) => v.toFixed(3) },
        splitLine: { lineStyle: { color: fc, opacity: 0.08 } }
      },
      series: [{
        type: 'line',
        name: 'z_offset',
        data: vals,
        smooth: false,
        symbolSize: 6,
        lineStyle: { color: '#2196F3', width: 2 },
        itemStyle: { color: '#2196F3' },
        areaStyle: { color: 'rgba(33,150,243,0.08)' },
        markLine: {
          silent: true,
          data: [
            { yAxis: startVal, lineStyle: { type: 'solid', color: 'rgba(76,175,80,0.5)', width: 1 }, label: { formatter: 'start', fontSize: 9 } },
            { yAxis: startVal + 0.05, lineStyle: { type: 'dashed', color: 'rgba(244,67,54,0.5)', width: 1 }, label: { formatter: '+50μm', fontSize: 9 } },
            { yAxis: startVal - 0.05, lineStyle: { type: 'dashed', color: 'rgba(244,67,54,0.5)', width: 1 }, label: { formatter: '-50μm', fontSize: 9 } }
          ]
        }
      }]
    }
  }

  @Watch('currentZOffset')
  onZOffsetChange (newVal: number) {
    if (this.samples.length > 0 && Math.abs(this.samples[this.samples.length - 1].value - newVal) < 0.0001) return
    if (this.samples.length === 0) this.startValue = newVal
    this.samples.push({ time: new Date().toLocaleTimeString(), value: newVal })
    if (this.samples.length > MAX_SAMPLES) this.samples.shift()
  }
}
</script>
