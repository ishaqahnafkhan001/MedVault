import * as Sentry from "@sentry/node";

export function initializeWorkerSentry(dsn: string | undefined, environment: string): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.extra;
      if (event.request) {
        delete event.request.data;
        delete event.request.headers;
        delete event.request.cookies;
      }
      return event;
    },
  });
}
