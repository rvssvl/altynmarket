import { Schema } from "effect";

export class ApiFailure extends Error {
  readonly _tag = "ApiFailure";

  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export class BackendInfrastructureFailure extends Schema.TaggedErrorClass<BackendInfrastructureFailure>()(
  "BackendInfrastructureFailure",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}
