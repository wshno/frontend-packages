import { context, propagation, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import type { TextMapGetter } from '@opentelemetry/api'

/** Reads trace context from Fetch API `Headers`, e.g. an incoming `Request`'s. */
export const headersTextMapGetter: TextMapGetter<Headers> = {
  keys(carrier) {
    return [...carrier.keys()]
  },
  get(carrier, key) {
    return carrier.get(key) ?? undefined
  },
}

export interface RequestSpanOptions {
  /** Tracer name, e.g. `my-app.react-router`. */
  tracerName: string
  /** Span name. Default `ssr.document`. */
  spanName?: string
}

/**
 * Runs `fn` inside a server span for an incoming request, continuing the trace from its `traceparent`
 * header. The span records the method, path and URL, and the error if `fn` throws. Use it in
 * `entry.server.tsx` around the render.
 */
export function withRequestSpan<T>(request: Request, fn: () => Promise<T>, options: RequestSpanOptions): Promise<T> {
  const parentContext = propagation.extract(context.active(), request.headers, headersTextMapGetter)

  return context.with(parentContext, async () => {
    // SERVER: it handles an incoming request, so trace backends and request reports count it as one.
    const span = trace.getTracer(options.tracerName).startSpan(options.spanName ?? 'ssr.document', {
      kind: SpanKind.SERVER,
      attributes: {
        'http.request.method': request.method,
        'url.path': new URL(request.url).pathname,
        'url.full': request.url,
      },
    })

    try {
      const result = await context.with(trace.setSpan(context.active(), span), fn)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (error) {
      span.recordException(error instanceof Error ? error : String(error))
      span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      span.end()
    }
  })
}
