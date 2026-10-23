// CloudFront invokes this global entry point directly.
// eslint-disable-next-line no-unused-vars
function handler(event) {
  const headers = event.request.headers;
  headers['x-napl-client-ip'] = { value: event.viewer.ip };
  delete headers['x-napl-authorization'];
  if (headers.authorization) headers['x-napl-authorization'] = { value: headers.authorization.value };
  return event.request;
}
