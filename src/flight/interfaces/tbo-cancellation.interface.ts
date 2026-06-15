export interface TBOCancellationChargeResponse {
  Response: {
    ResponseStatus: number;
    Error: {
      ErrorCode: number;
      ErrorMessage: string;
    };
    CancellationCharge: number;
    RefundAmount: number;
    B2BAmendmentCharges?: number;
    AirlineAmendmentCharges?: number;
    B2BRefundAmount?: number;
  };
}

export interface TBOSendChangeRequestResponse {
  Response: {
    ResponseStatus: number;
    Error: {
      ErrorCode: number;
      ErrorMessage: string;
    };
    ChangeRequestId: number;
  };
}

export interface TBOChangeRequestStatusResponse {
  Response: {
    ResponseStatus: number;
    Error: {
      ErrorCode: number;
      ErrorMessage: string;
    };
    ChangeRequestId: number;
    ChangeRequestStatus: number; // 1: Unassigned, 2: Assigned, 3: Acknowledged, 4: Completed, 5: Rejected, 6: InProgress
    RefundedAmount: number;
    CancellationCharge: number;
    B2BAmendmentCharges?: number;
  };
}
