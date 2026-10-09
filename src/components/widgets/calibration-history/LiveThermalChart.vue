<template>
  <v-card outlined>
    <v-card-title class="subtitle-2 pb-1">
      Thermal Monitor (Heater PID + Power)
      <v-spacer />
      <v-chip x-small class="mr-1 font-weight-bold" :color="hotendStatusColor" text-color="white">
        🔥 {{ hotendTemp.toFixed(1) }}°C / {{ hotendTarget.toFixed(0) }}°C
      </v-chip>
      <v-chip x-small :color="bedStatusColor" text-color="white">
        🛏 {{ bedTemp.toFixed(1) }}°C / {{ bedTarget.toFixed(0) }}°C
      </v-chip>
    </v-card-title>

    <v-card-text class="pa-0">
      <div :style="{ height: chartHeight + 'px' }">
        <e-chart
          ref="chart"
          :option="chartOptions"
          :update-options="updateOptions"
          :init-options="initOptions"
          autoresize
        />
      </div>
      <div class="px-3 pb-2 d-flex flex-wrap justify-space-between caption grey--text">
        <span>Heater power: <b :class="hotendPower > 0.95 ? 'error--text' : ''">{{ (hotendPower * 100).toFixed(0) }}%</b></span>
        <span>Heating rate: <b>{{ heatingRateDisplay }}</b></span>
        <span>Temp stability: <b>{{ tempStabilityDisplay }}</b></span>
        <span>MCU temp: <b :class="mcuTemp > 70 ? 'error--text' : ''">{{ mcuTemp.toFixed(1) }}°C</b></span>
      </div>
    </v-card-text>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch, Ref } from 'vue-property-decorator'
import type { ECharts, EChartsInitOpts, SetOptionOpts } from 'echarts'

const MAX_SAMPLES = 300

interface ThermalSample {
  time: string
  hotend: number
  hotendTarget: number
  hotendPower: number
  bed: number
}

@Component({})
export default class LiveThermalChart extends Vue {
  @Prop({ type: Number, default: 220 })
  readonly chartHeight!: number

  @Ref('chart')
  readonly chartRef?: ECharts

  // Stable references — prevent vue-echarts from disposing/re-initing the chart
  readonly updateOptions: SetOptionOpts = Object.freeze({ notMerge: false, lazyUpdate: true })
  readonly initOptions: EChartsInitOpts = Object.freeze({ renderer: 'canvas' })

  samples: ThermalSample[] = []
  heatingRateValues: number[] = []
  tempVarianceValues: number[] = []
  private _lastSampleTime = 0

  get hotendTemp (): number { return this.$store.state.printer.printer.extruder?.temperature ?? 0 }
  get hotendTarget (): number { return this.$store.state.printer.printer.extruder?.target ?? 0 }
  get hotendPower (): number { return this.$store.state.printer.printer.extruder?.power ?? 0 }
  get bedTemp (): number { return this.$store.state.printer.printer.heater_bed?.temperature ?? 0 }
  get bedTarget (): number { return this.$store.state.printer.printer.heater_bed?.target ?? 0 }
  get mcuTemp (): number { return this.$store.state.printer.printer.temperature_mcu?.temperature ?? 0 }
  get isDark (): boolean { return this.$store.state.config.uiSettings.theme.isDark }

  get hotendStatusColor (): string {
    const diff = Math.abs(this.hotendTemp - this.hotendTarget)
    if (this.hotendTarget === 0) return 'grey'
    if (diff < 2) return 'green'; if (diff < 10) return 'orange'; return 'red'
  }
  get bedStatusColor (): string {
    const diff = Math.abs(this.bedTemp - this.bedTarget)
    if (this.bedTarget === 0) return 'grey'
    if (diff < 1) return 'green'; if (diff < 5) return 'orange'; return 'red'
  }

  get heatingRateDisplay (): string {
    if (this.heatingRateValues.length < 2) return '—'
    const r = this.heatingRateValues[this.heatingRateValues.length - 1]
    return (r >= 0 ? '+' : '') + r.toFixed(2) + '°/s'
  }
  get tempStabilityDisplay (): string {
    if (this.tempVarianceValues.length < 10) return '—'
    const avg = this.tempVarianceValues.reduce((a, b) => a + b, 0) / this.tempVarianceValues.length
    const std = Math.sqrt(this.tempVarianceValues.reduce((a, b) => a + (b - avg) ** 2, 0) / this.tempVarianceValues.length)
    if (this.hotendTarget <= 30) return '±' + std.toFixed(2) + '°C'
    return std < 0.5 ? '±' + std.toFixed(2) + '°C' : '⚠ ±' + std.toFixed(2) + '°C'
  }

  /** The full chart option — recomputed only when samples array changes.
   *  animation:false prevents the "loading from start" visual.
   *  notMerge:false in updateOptions means ECharts merges the new option
   *  into the existing chart without reinitialising it — no animation restart. */
  get chartOptions () {
    const isDark = this.isDark
    const fc = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
    const samples = this.samples

    return {
      animation: false,
      backgroundColor: 'transparent',
      legend: { show: true, bottom: 0, textStyle: { color: fc, fontSize: 10 } },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark ? 'rgba(10,10,10,0.9)' : 'rgba(255,255,255,0.9)',
        textStyle: { color: fc, fontSize: 11 },
        formatter: (params: any[]) => {
          const s = samples[params[0]?.dataIndex]
          if (!s) return ''
          return `<b>${s.time}</b><br/>Hotend: <b>${s.hotend.toFixed(1)}°C</b> / target ${s.hotendTarget.toFixed(0)}°C<br/>Power: <b>${(s.hotendPower * 100).toFixed(0)}%</b><br/>Bed: <b>${s.bed.toFixed(1)}°C</b>`
        }
      },
      grid: { top: 8, left: 48, right: 48, bottom: 36 },
      xAxis: {
        type: 'category',
        data: samples.map(s => s.time),
        axisLabel: { show: false },
        axisLine: { lineStyle: { color: fc, opacity: 0.15 } },
        axisTick: { show: false }
      },
      yAxis: [
        { type: 'value', name: '°C', nameTextStyle: { color: fc, fontSize: 9 }, axisLabel: { color: fc, fontSize: 9 }, splitLine: { lineStyle: { color: fc, opacity: 0.08 } } },
        { type: 'value', name: 'Power %', min: 0, max: 100, nameTextStyle: { color: fc, fontSize: 9 }, axisLabel: { color: fc, fontSize: 9, formatter: (v: number) => v + '%' }, splitLine: { show: false } }
      ],
      series: [
        { name: 'Hotend', type: 'line', yAxisIndex: 0, data: samples.map(s => s.hotend), symbol: 'none', lineStyle: { color: '#FF5722', width: 2 }, areaStyle: { color: 'rgba(255,87,34,0.07)' } },
        { name: 'Target', type: 'line', yAxisIndex: 0, data: samples.map(s => s.hotendTarget), symbol: 'none', lineStyle: { color: '#FF5722', type: 'dashed', width: 1, opacity: 0.5 } },
        { name: 'Bed', type: 'line', yAxisIndex: 0, data: samples.map(s => s.bed), symbol: 'none', lineStyle: { color: '#2196F3', width: 1.5 } },
        {
          name: 'Heater Power', type: 'bar', yAxisIndex: 1,
          data: samples.map(s => +(s.hotendPower * 100).toFixed(1)),
          barMaxWidth: 4,
          itemStyle: { color: (p: any) => p.value > 95 ? '#f44336' : p.value > 70 ? '#FF9800' : 'rgba(255,255,255,0.2)' }
        }
      ]
    }
  }

  beforeDestroy () {
    if (this.chartRef) (this.chartRef as any).dispose?.()
  }

  @Watch('hotendTemp')
  onTempChange (newVal: number, oldVal: number) {
    const now = Date.now()
    if (now - this._lastSampleTime < 1000) return
    this._lastSampleTime = now

    if (oldVal > 0) {
      this.heatingRateValues.push(+(newVal - oldVal).toFixed(3))
      if (this.heatingRateValues.length > 20) this.heatingRateValues.shift()
    }
    this.tempVarianceValues.push(newVal)
    if (this.tempVarianceValues.length > 20) this.tempVarianceValues.shift()

    this.samples.push({ time: new Date().toLocaleTimeString(), hotend: newVal, hotendTarget: this.hotendTarget, hotendPower: this.hotendPower, bed: this.bedTemp })
    if (this.samples.length > MAX_SAMPLES) this.samples.shift()
  }
}
</script>
