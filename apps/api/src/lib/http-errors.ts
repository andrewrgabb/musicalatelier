/**
 * Domain errors the service layer can throw to signal an HTTP outcome without
 * knowing anything about Express. The central error handler (in index.ts) maps
 * an HttpError to its status code; anything else becomes a 500.
 *
 * This keeps business logic in the service (it decides "this is a bad request"
 * or "this wasn't found") while the route stays a thin translator.
 */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(400, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not found") {
    super(404, message);
  }
}
