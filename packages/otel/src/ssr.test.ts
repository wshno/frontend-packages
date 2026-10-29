import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { W3CTraceContextPropagator } from '@opentelemetry/core'
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { withRequestSpan } from './ssr.js'

const exporter = new InMemorySpanExporter()
const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] })

beforeAll(() => {
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
  propagation.setGlobalPropagator(new W3CTraceContextPropagator())
  trace.setGlobalTracerProvider(provider)
})

afterAll(async () => {
  await provider.shutdown()
  trace.disable()
  propagation.disable()
  context.disable()
})

beforeEach(() => {
  exporter.reset()
})

const traceId = '0af7651916cd43dd8448eb211c80319c'
const parentSpanId = 'b7ad6b7169203331'

describe('withRequestSpan', () => {
  it('continues the trace from traceparent and records the request', async () => {
    const request = new Request('https://app.example.com/items?page=2', {
      headers: { traceparent: `00-${traceId}-${parentSpanId}-01` },
    })

    const result = await withRequestSpan(request, async () => trace.getActiveSpan()?.spanContext().traceId, {
      tracerName: 'test.react-router',
    })

    expect(result).toBe(traceId)
    const [span] = exporter.getFinishedSpans()
    expect(span?.name).toBe('ssr.document')
    expect(span?.spanContext().traceId).toBe(traceId)
    expect(span?.parentSpanContext?.spanId).toBe(parentSpanId)
    expect(span?.attributes['http.request.method']).toBe('GET')
    expect(span?.attributes['url.full']).toBe('https://app.example.com/items?page=2')
    expect(span?.status.code).toBe(SpanStatusCode.OK)
  })

  it('records the error and rethrows it', async () => {
    const request = new Request('https://app.example.com/', { method: 'POST' })

    await expect(
      withRequestSpan(
        request,
        async () => {
          throw new Error('render failed')
        },
        { tracerName: 'test.react-router', spanName: 'ssr.action' },
      ),
    ).rejects.toThrow('render failed')

    const [span] = exporter.getFinishedSpans()
    expect(span?.name).toBe('ssr.action')
    expect(span?.status).toEqual({ code: SpanStatusCode.ERROR, message: 'render failed' })
    expect(span?.events.map((event) => event.name)).toContain('exception')
  })
})
