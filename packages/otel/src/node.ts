import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchLogRecordProcessor } from '@opentelemetry/sdk-logs'
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics'
import { NodeSDK } from '@opentelemetry/sdk-node'

type AutoInstrumentationsConfig = NonNullable<Parameters<typeof getNodeAutoInstrumentations>[0]>

export interface NodeTelemetryOptions {
  /** `service.name` when `OTEL_SERVICE_NAME` isn't set. */
  serviceName?: string
  /**
   * Per-instrumentation config for `@opentelemetry/auto-instrumentations-node`, merged over the defaults
   * (the fs instrumentation is off: it's very noisy and rarely useful).
   */
  instrumentations?: AutoInstrumentationsConfig
}

let sdk: NodeSDK | undefined

/**
 * Starts the OpenTelemetry Node SDK for an SSR server: traces, metrics and logs over OTLP/HTTP, with
 * the Node auto-instrumentations. Endpoints and the rest come from the standard `OTEL_*` environment
 * variables (e.g. `OTEL_EXPORTER_OTLP_ENDPOINT`). Does nothing when `OTEL_SDK_DISABLED=true`.
 * Call it once at server start. Later calls return the first SDK.
 * @returns the started SDK, or `undefined` when disabled.
 */
export function startNodeTelemetry(options: NodeTelemetryOptions = {}): NodeSDK | undefined {
  if (sdk) return sdk
  if (process.env.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true') return undefined

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? options.serviceName,
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })],
    logRecordProcessors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })],
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        ...options.instrumentations,
      }),
    ],
  })
  sdk.start()
  return sdk
}
