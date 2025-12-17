// /services/slot-service/src/domain/events/SlotCreatedEvent.js

export class SlotCreatedEvent {
  constructor(slotId, name, floor, details, parkingSiteId, floorId, slotNumber, vehicleType, zoneId) {
    this.slotId = slotId;
    this.name = name;
    this.floor = floor;
    this.details = details;
    this.parkingSiteId = parkingSiteId;
    this.floorId = floorId;
    this.slotNumber = slotNumber; // 👈 New field
    this.vehicleType = vehicleType || 'car'; // 👈 New field
    this.zoneId = zoneId; // 👈 Ensure this is passed if needed by projection
    this.status = "available";
  }
}
