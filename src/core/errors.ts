export class ConnectError extends Error {
  readonly code: string;
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = "ConnectError";
    this.code = code;
    this.statusCode = statusCode;
  }
}
