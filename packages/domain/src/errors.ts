export interface DomainError {
  readonly _tag: string;
  readonly message: string;
  readonly cause?: unknown;
}

export interface ValidationError extends DomainError {
  readonly _tag: "ValidationError";
  readonly field?: string;
}

export interface NotFoundError extends DomainError {
  readonly _tag: "NotFoundError";
  readonly resource: string;
}

export interface PermissionDeniedError extends DomainError {
  readonly _tag: "PermissionDeniedError";
}

export interface PaymentError extends DomainError {
  readonly _tag: "PaymentError";
  readonly providerCode?: string;
}

export type AppError =
  | ValidationError
  | NotFoundError
  | PermissionDeniedError
  | PaymentError;
