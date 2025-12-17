// /services/user-car-service/src/domain/commands/CreateReservationCommand.js

export class CreateReservationCommand {
  constructor(data) {
    // รับ data มาเป็น object ก้อนเดียว (DTO)
    const { 
      userId, slotId, parkingSiteId, floorId,
      startTimeStamp, startDateLocal, startTimeLocal,
      endTimeStamp, endDateLocal, endTimeLocal,
      timeZoneOffset,
      vehicleType, // 👈 New Input
      carId        // 👈 New Input
    } = data;

    // 1. Validation
    if (!userId || !slotId || !parkingSiteId || !floorId) {
      throw new Error("Missing required IDs (User, Slot, Site, Floor).");
    }
    if (!startDateLocal || !startTimeLocal || !endDateLocal || !endTimeLocal || !timeZoneOffset) {
      throw new Error("Missing required date/time components.");
    }

    // 2. Assign to 'this' (Flat Structure)
    this.userId = userId;
    this.slotId = slotId;
    this.parkingSiteId = parkingSiteId;
    this.floorId = floorId;
    
    // Time fields
    this.startTimeStamp = startTimeStamp;
    this.startDateLocal = startDateLocal;
    this.startTimeLocal = startTimeLocal;
    
    this.endTimeStamp = endTimeStamp;
    this.endDateLocal = endDateLocal;
    this.endTimeLocal = endTimeLocal;
    
    this.timeZoneOffset = timeZoneOffset;
    this.vehicleType = vehicleType || 'car'; // 👈 New Property
    this.carId = carId || null;              // 👈 New Property
  }
}