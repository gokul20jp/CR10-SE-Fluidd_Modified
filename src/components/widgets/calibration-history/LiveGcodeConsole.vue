<template>
  <v-card outlined class="live-gcode-console">
    <v-card-title class="subtitle-2 pb-1">
      Live GCode Stream
      <v-spacer />
      <v-chip
        v-if="errorCount > 0"
        x-small
        color="error"
        text-color="white"
        class="mr-2"
      >
        {{ errorCount }} errors
      </v-chip>
      <!-- Clear button -->
      <v-btn
        text
        x-small
        class="caption mr-1"
        @click="clearLog()"
      >
        Clear
      </v-btn>
      <!-- Auto-scroll toggle -->
      <v-btn
        text
        x-small
        :color="autoScroll ? 'primary' : 'grey'"
        class="caption"
        @click="autoScroll = !autoScroll"
      >
        {{ autoScroll ? '↓ Auto' : '↓ Manual' }}
      </v-btn>
    </v-card-title>

    <!-- Filter chips -->
    <div class="px-3 pb-1 d-flex flex-wrap" style="gap: 4px;">
      <v-chip
        v-for="f in filters"
        :key="f.key"
        x-small
        :outlined="!f.active"
        :color="f.active ? f.color : ''"
        :text-color="f.active ? 'white' : ''"
        @click="f.active = !f.active"
      >
        {{ f.label }}
      </v-chip>
    </div>

    <!-- Console output -->
    <div
      ref="consoleEl"
      class="console-output"
      :style="{ height: consoleHeight + 'px' }"
    >
      <div
        v-for="(line, idx) in filteredLines"
        :key="idx"
        class="console-line"
        :class="lineClass(line)"
      >
        <span class="line-time">{{ line.time }}</span>
        <span class="line-content">{{ line.text }}</span>
        <v-chip
          v-if="line.isAnomaly"
          x-small
          color="error"
          text-color="white"
          class="ml-1"
        >
          ANOMALY
        </v-chip>
      </div>
      <div v-if="!isConsoleStoreAvailable" class="grey--text caption pa-2">
        Console store unavailable — Moonraker may still be initializing.
      </div>
      <div v-else-if="filteredLines.length === 0" class="grey--text caption pa-2">
        No GCode output matching active filters yet.
        <span v-if="lines.length > 0"> ({{ lines.length }} lines hidden by filters)</span>
      </div>
    </div>
  </v-card>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch, Ref } from 'vue-property-decorator'

interface ConsoleLine {
  time: string
  text: string
  type: 'response' | 'command' | 'error' | 'layer' | 'temp' | 'info'
  isAnomaly: boolean
}

const MAX_LINES = 500

@Component({})
export default class LiveGcodeConsole extends Vue {
  @Prop({ type: Number, default: 200 })
  readonly consoleHeight!: number

  @Ref('consoleEl')
  readonly consoleEl?: HTMLElement

  lines: ConsoleLine[] = []
  autoScroll = true

  filters = [
    { key: 'error', label: 'Errors', active: true, color: 'error' },
    { key: 'layer', label: 'Layers', active: true, color: 'blue' },
    { key: 'temp', label: 'Temps', active: false, color: 'orange' },
    { key: 'command', label: 'Commands', active: false, color: 'grey' },
    { key: 'response', label: 'Responses', active: true, color: 'green' }
  ]

  get errorCount (): number {
    return this.lines.filter(l => l.type === 'error').length
  }

  // Read from the console store which already captures notify_gcode_response.
  // Guard against missing/undefined console state (console module may not be initialized yet).
  get consoleEntries (): any[] {
    try {
      return this.$store.state.console?.console ?? []
    } catch {
      return []
    }
  }

  get isConsoleStoreAvailable (): boolean {
    return Array.isArray(this.$store.state.console?.console)
  }

  get filteredLines (): ConsoleLine[] {
    const activeTypes = this.filters
      .filter(f => f.active)
      .map(f => f.key)
    return this.lines.filter(l => activeTypes.includes(l.type))
  }

  @Watch('consoleEntries')
  onConsoleChange (newEntries: any[], oldEntries: any[]) {
    if (!Array.isArray(newEntries)) return
    // Detect new entries added since last update
    const newCount = newEntries.length - (oldEntries?.length ?? 0)
    if (newCount <= 0) return

    const added = newEntries.slice(-newCount)
    for (const entry of added) {
      this.addLine(entry)
    }
  }

  addLine (entry: any) {
    const text: string = entry.message ?? entry.text ?? String(entry)
    const time = new Date().toLocaleTimeString()

    const type = this.classifyLine(text)
    const isAnomaly = text.startsWith('!!') || text.toLowerCase().includes('error') ||
      text.toLowerCase().includes('layer_tracker: critical') ||
      text.toLowerCase().includes('layer_tracker: warning')

    this.lines.push({ time, text, type, isAnomaly })
    if (this.lines.length > MAX_LINES) {
      this.lines.splice(0, this.lines.length - MAX_LINES)
    }

    if (this.autoScroll) {
      this.$nextTick(() => {
        if (this.consoleEl) {
          this.consoleEl.scrollTop = this.consoleEl.scrollHeight
        }
      })
    }
  }

  classifyLine (text: string): ConsoleLine['type'] {
    if (text.startsWith('!!') || text.toLowerCase().startsWith('error')) return 'error'
    if (/^(?:Send|Recv):\s*[GM]\d+/i.test(text)) return 'command'
    if (/T:\d+|B:\d+|ok/i.test(text)) return 'temp'
    if (/layer_tracker|z:\s*\d+\.\d+/i.test(text)) return 'layer'
    if (text.startsWith('//')) return 'info'
    return 'response'
  }

  lineClass (line: ConsoleLine): string {
    switch (line.type) {
      case 'error': return 'line-error'
      case 'command': return 'line-command'
      case 'temp': return 'line-temp'
      case 'layer': return 'line-layer'
      case 'info': return 'line-info'
      default: return 'line-response'
    }
  }

  clearLog () {
    this.lines = []
  }
}
</script>

<style lang="scss" scoped>
.console-output {
  overflow-y: auto;
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 11px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.15);
  border-top: 1px solid rgba(128, 128, 128, 0.15);
}

.console-line {
  display: flex;
  align-items: flex-start;
  padding: 1px 0;
  border-bottom: 1px solid rgba(128, 128, 128, 0.05);
  word-break: break-all;

  .line-time {
    color: rgba(128, 128, 128, 0.5);
    min-width: 60px;
    font-size: 10px;
    margin-right: 6px;
    flex-shrink: 0;
  }

  .line-content {
    flex: 1;
    white-space: pre-wrap;
  }
}

.line-error { color: #ef5350; }
.line-command { color: #90CAF9; }
.line-temp { color: rgba(255, 255, 255, 0.35); }
.line-layer { color: #A5D6A7; font-weight: 600; }
.line-info { color: rgba(255, 193, 7, 0.8); }
.line-response { color: rgba(255, 255, 255, 0.65); }
</style>
