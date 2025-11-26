export class ReservationCreatedEvent {
  constructor(
    reservationId, userId, slotId, reservedAt,
    // Time Components
    startTimeStamp, startDateLocal, startTimeLocal,
    endTimeStamp, endDateLocal, endTimeLocal,
    timeZoneOffset,
    // Location
    parkingSiteId, floorId
  ) {
    this.reservationId = reservationId;
    this.userId = userId;
    this.slotId = slotId;
    this.reservedAt = reservedAt;
    this.status = "pending";
    
    // Assign Flat
    this.startTimeStamp = startTimeStamp;
    this.startDateLocal = startDateLocal;
    this.startTimeLocal = startTimeLocal;
    
    this.endTimeStamp = endTimeStamp;
    this.endDateLocal = endDateLocal;
    this.endTimeLocal = endTimeLocal;
    
    this.timeZoneOffset = timeZoneOffset;
    this.parkingSiteId = parkingSiteId;
    this.floorId = floorId;
  }
}