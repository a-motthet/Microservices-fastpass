// /services/slot-service/src/domain/commands/CreateSlotCommand.js

export class CreateSlotCommand {
  /**
   * @param {string} name - ชื่อช่องจอด เช่น "A-01"
   * @param {string} floor - (Optional) ชื่อชั้น เช่น "P1"
   * @param {string} details - (Optional) รายละเอียด เช่น "ใกล้ลิฟต์"
   * @param {string} parkingSiteId - ID ของสถานที่จอดรถ
   * @param {string} floorId - ID ของชั้น
   */
  constructor(name, floor, details, parkingSiteId, floorId) {
    if (!name) {
      throw new Error("Slot name is required.");
    }
    if (!parkingSiteId) {
      throw new Error("Parking Site ID is required.");
    }
    this.name = name;
    this.floor = floor;
    this.details = details;
    this.parkingSiteId = parkingSiteId;
    this.floorId = floorId;
  }
}
