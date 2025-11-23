// src/domain/events/ReservationCreatedEvent.js

export class ReservationCreatedEvent {
  /**
   * @param {string} reservationId
   * @param {string} userId
   * @param {string} slotId
   * @param {Date} reservedAt
   * @param {Date} startTime
   * @param {Date} endTime
   * @param {string} parkingSiteId
   * @param {string} floorId
   */
  constructor(
    reservationId,
    userId,
    slotId,
    reservedAt,
    startTime,
    endTime,
    parkingSiteId,
    floorId
  ) {
    this.reservationId = reservationId;
    this.userId = userId;
    this.slotId = slotId;
    this.reservedAt = reservedAt;
    this.status = "pending";
    this.startTime = startTime;
    this.endTime = endTime;
    this.parkingSiteId = parkingSiteId;
    this.floorId = floorId
  }
}