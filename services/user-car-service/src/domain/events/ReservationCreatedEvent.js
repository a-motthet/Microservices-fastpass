// src/domain/events/ReservationCreatedEvent.js

export class ReservationCreatedEvent {
  constructor(
    reservationId, userId, slotId, reservedAt,
    startTimeStamp, startDateLocal, startTimeLocal,
    endTimeStamp, endDateLocal, endTimeLocal,
    timeZoneOffset,
    parkingSiteId, floorId,
    statusCode,
    vehicleType,
    carId,
    reservedAtDateLocal, // 👈 New
    reservedAtTimeLocal, // 👈 New
    reservedAtTimeStamp  // 👈 New
  ) {
    // --- Group 1: IDs (เอา ID ทั้งหมดขึ้นก่อน) ---
    this.reservationId = reservationId;
    this.userId = userId;
    this.parkingSiteId = parkingSiteId; // 👈 ย้ายขึ้นมาตรงนี้
    this.floorId = floorId;             // 👈 ย้ายขึ้นมาตรงนี้
    this.slotId = slotId;

    // --- Group 2: Status (สถานะ) ---
    this.status = "pending";
    this.statusCode = statusCode || "1";

    // --- Group 3: Start Time (เวลาเริ่ม) ---
    this.startTimeStamp = startTimeStamp;
    this.startDateLocal = startDateLocal;
    this.startTimeLocal = startTimeLocal;

    // --- Group 4: End Time (เวลาจบ) ---
    this.endTimeStamp = endTimeStamp;
    this.endDateLocal = endDateLocal;
    this.endTimeLocal = endTimeLocal;

    // --- Group 5: Meta Data (อื่นๆ) ---
    this.timeZoneOffset = timeZoneOffset;
    this.reservedAt = reservedAt; // Will be deleted by EventStore, but kept here for now or removed if unused?
    
    // New Fields
    this.reservedAtDateLocal = reservedAtDateLocal;
    this.reservedAtTimeLocal = reservedAtTimeLocal;
    this.reservedAtTimeStamp = reservedAtTimeStamp;

    this.vehicleType = vehicleType || 'car'; 
    this.carId = carId || null;              
  }
}