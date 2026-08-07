export class ProtocolError extends Error {
  readonly type: string;
  readonly id: number | undefined;
  readonly communicationType: string;
  readonly requestId: number | undefined;
  readonly errorType: string | undefined;

  constructor(options: {
    type: string;
    requestId?: number;
    errorType?: string;
  }) {
    super(
      options.errorType
        ? `${options.type}: ${options.errorType}`
        : options.type,
    );
    this.name = "ProtocolError";
    this.type = options.type;
    this.id = options.requestId;
    this.communicationType = options.type;
    this.requestId = options.requestId;
    this.errorType = options.errorType;
  }
}
