import { context, propagation, trace } from '@opentelemetry/api'
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web'
import { ZoneContextManager } from '@opentelemetry/context-zone'
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'

export interface WebTelemetryOptions {
  /** OTLP/HTTP traces endpoint, e.g. `https://app.example.com/v1/traces`. Nothing starts when it's empty. */
  url: string | undefined
  /** `service.name` on every span. */
  serviceName: string
  /**
   * Cross-origin URLs that fetch/XHR spans propagate `traceparent` to. Same-origin requests always get it.
   * Only list origins whose CORS config allows the header. Default: none.
   */
  propagateTraceHeaderCorsUrls?: RegExp | string | (RegExp | string)[]
  /** Extra URLs that fetch/XHR instrumentation ignores. The traces endpoint is always ignored. */
  ignoreUrls?: (RegExp | string)[]
}

let provider: TracerProvider | undefined

/**
 * Starts browser tracing: fetch, XHR, document load and user interaction spans, exported over
 * OTLP/HTTP, with a Zone.js context manager and W3C trace-context and baggage propagation.
 * Call it once from the client entry. Later calls return the first provider.
 * @returns the registered provider, or `undefined` when `url` is empty.
 */
export function startWebTelemetry(options: WebTelemetryOptions): TracerProvider | undefined {
  if (provider) return provider
  const url = options.url?.trim()
  if (!url) return undefined

  const tracerProvider = new TracerProvider({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: options.serviceName }),
    spanProcessors: [new BatchSpanProcessor({ exporter: new OTLPTraceExporter({ url }) })],
  })

  // What WebTracerProvider.register() did before OpenTelemetry JS 3.0.
  context.setGlobalContextManager(new ZoneContextManager().enable())
  propagation.setGlobalPropagator(
    new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }),
  )
  trace.setGlobalTracerProvider(tracerProvider)

  const ignoreUrls = [url, /\/v1\/traces(\?|$)/, ...(options.ignoreUrls ?? [])]
  const propagateTraceHeaderCorsUrls = options.propagateTraceHeaderCorsUrls ?? []
  registerInstrumentations({
    tracerProvider,
    instrumentations: [
      getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-fetch': {
          propagateTraceHeaderCorsUrls,
          ignoreUrls,
          clearTimingResources: true,
        },
        '@opentelemetry/instrumentation-xml-http-request': { propagateTraceHeaderCorsUrls, ignoreUrls },
      }),
    ],
  })

  provider = tracerProvider
  return provider
}
