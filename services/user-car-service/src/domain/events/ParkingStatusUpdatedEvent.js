// src/domain/events/ParkingStatusUpdatedEvent.js

export class ParkingStatusUpdatedEvent {
  /**
   * @param {string} reservationId
   * @param {string} newStatus
   * @param {Date} updatedAt
   */
  constructor(reservationId, newStatus, statusCode, updatedAt, userId) {
    this.reservationId = reservationId;
    this.newStatus = newStatus;
    this.statusCode = statusCode;
    this.updatedAt = updatedAt;
    this.userId = userId;
  }
}
