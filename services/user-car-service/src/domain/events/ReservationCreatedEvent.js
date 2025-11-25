// src/domain/events/ReservationCreatedEvent.js

export class ReservationCreatedEvent {
  /**
   * @param {string} reservationId
   * @param {string} userId
   * @param {string} slotId
   * @param {number} startTimeStamp - Unix timestamp (seconds)
   * @param {string} startDateLocal - "2025-11-24"
   * @param {string} startTimeLocal - "09:00:00"
   * @param {number} endTimeStamp - Unix timestamp (seconds)
   * @param {string} endDateLocal - "2025-11-24"
   * @param {string} endTimeLocal - "10:00:00"
   * @param {string} timeZoneOffset - "+07:00"
   * @param {number} createdAt - Unix timestamp (seconds)
   * @param {string} parkingSiteId
   * @param {string} floorId 
   */
  constructor(
    reservationId,
    userId,
    slotId,
    startTimeStamp,
    startDateLocal,
    startTimeLocal,
    endTimeStamp,
    endDateLocal,
    endTimeLocal,
    timeZoneOffset,
    createdAt,
    parkingSiteId,
    floorId
  ) {
    this.reservationId = reservationId;
    this.userId = userId;
    this.slotId = slotId;
    
    // Start Time Components
    this.startTimeStamp = startTimeStamp;
    this.startDateLocal = startDateLocal;
    this.startTimeLocal = startTimeLocal;
    
    // End Time Components
    this.endTimeStamp = endTimeStamp;
    this.endDateLocal = endDateLocal;
    this.endTimeLocal = endTimeLocal;
    
    // Timezone Info
    this.timeZoneOffset = timeZoneOffset;
    
    // Created Timestamp
    this.createdAt = createdAt;
    
    this.status = "pending";
    this.parkingSiteId = parkingSiteId;
    this.floorId = floorId;
  }
}