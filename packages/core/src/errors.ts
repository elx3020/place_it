export type ErrorCode =
  | "config-invalid"
  | "config-version"
  | "camera-denied"
  | "camera-unavailable"
  | "model-invalid"
  | "tracker-failed";

export class PlaceItError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "PlaceItError";
    this.code = code;
  }
}
