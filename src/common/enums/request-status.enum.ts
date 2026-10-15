export enum RequestStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  CLOSED = 'CLOSED',
}

/**
 * Defines strict forward-only status transitions:
 * NEW -> CONTACTED -> QUALIFIED -> CLOSED
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<RequestStatus, RequestStatus | null> = {
  [RequestStatus.NEW]: RequestStatus.CONTACTED,
  [RequestStatus.CONTACTED]: RequestStatus.QUALIFIED,
  [RequestStatus.QUALIFIED]: RequestStatus.CLOSED,
  [RequestStatus.CLOSED]: null,
};
