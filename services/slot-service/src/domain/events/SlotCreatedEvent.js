// /services/slot-service/src/domain/events/SlotCreatedEvent.js

export class SlotCreatedEvent {
  constructor(slotId, name, floor, details, parkingSiteId, floorId) {
    this.slotId = slotId; // ID ที่เราจะสร้างให้
    this.name = name;
    this.floor = floor;
    this.details = details;
    this.parkingSiteId = parkingSiteId;
    this.floorId = floorId;
    this.status = "available"; // สถานะเริ่มต้นคือ "ว่าง"
  }
}
