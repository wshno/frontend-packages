# @wshno/otel

OpenTelemetry setup for React Router apps, on OpenTelemetry JS 3.0:

| Entry              | For                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------- |
| `@wshno/otel/web`  | Browser tracing (fetch, XHR, document load, user interaction) over OTLP/HTTP                              |
| `@wshno/otel/node` | The Node SDK for the SSR server: traces, metrics and logs over OTLP/HTTP, configured by `OTEL_*` env vars |
| `@wshno/otel/ssr`  | A span per SSR request that continues the browser's trace                                                 |

The package pins one tested set of OpenTelemetry SDK versions. Apps depend on `@opentelemetry/api`
only (a peer dependency), for their own spans.

```bash
npm install @wshno/otel @opentelemetry/api
```

## Browser

`app/entry.client.tsx`:

```ts
import { startWebTelemetry } from '@wshno/otel/web'

startWebTelemetry({
  url: window.__APP_PUBLIC__?.otelTracesEndpoint,
  serviceName: 'my-app-web',
})
```

Nothing starts when `url` is empty. `traceparent` is only sent to the page's own origin; list other
origins in `propagateTraceHeaderCorsUrls` once their CORS config allows the header.

## SSR server

`app/entry.server.tsx`:

```ts
import { startNodeTelemetry } from '@wshno/otel/node'
import { withRequestSpan } from '@wshno/otel/ssr'

startNodeTelemetry({ serviceName: 'my-app-ssr' })

export default function handleRequest(request: Request /* , ... */) {
  return withRequestSpan(request, () => render(request), { tracerName: 'my-app.react-router' })
}
```

`OTEL_SERVICE_NAME` overrides `serviceName`; `OTEL_SDK_DISABLED=true` turns it all off. The fs
instrumentation is off by default; pass `instrumentations` to change any auto-instrumentation.
