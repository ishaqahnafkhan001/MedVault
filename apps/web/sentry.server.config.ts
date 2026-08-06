import * as Sentry from "@sentry/nextjs";

if (process.env.SENTRY_DSN) {
  Sentry.init({ dsn: process.env.SENTRY_DSN, sendDefaultPii: false, beforeSend: sanitize });
}

function sanitize(
  event: Parameters<NonNullable<Parameters<typeof Sentry.init>[0]["beforeSend"]>>[0],
) {
  if (event.request) {
    delete event.request.data;
    delete event.request.headers;
    delete event.request.cookies;
  }
  delete event.extra;
  return event;
}
