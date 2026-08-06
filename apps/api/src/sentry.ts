import * as Sentry from "@sentry/node";

export function initializeSentry(dsn: string | undefined, environment: string): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        delete event.request.cookies;
      }
      delete event.extra;
      return event;
    },
  });
}
