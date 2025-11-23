// /services/user-car-service/src/domain/commands/CreateReservationCommand.js

export class CreateReservationCommand {
  /**
   * @param {string} userId - ID ของผู้ใช้
   * @param {string} slotId - ID ของช่องเวลา (Time Slot ID)
   * @param {string} startTime - เวลาเริ่ม (ISO)
   * @param {string} endTime - เวลาจบ (ISO)
   * @param {string} parkingSiteId - ID ของสถานที่จอดรถ
   * @param {string} floorId - ID ของชั้นที่จอดรถ (เพิ่มใหม่)
   */
  constructor(userId, slotId, startTime, endTime, parkingSiteId, floorId) {

    if (
      !userId ||
      !slotId ||
      !startTime ||
      !endTime ||
      !parkingSiteId ||
      !floorId
    ) {
      throw new Error(
        "User ID, Slot ID, Start Time, End Time, Parking Site ID, and Floor ID are all required."
      );
    }

    // 2. กำหนดค่า
    this.userId = userId;
    this.slotId = slotId;
    this.startTime = startTime;
    this.endTime = endTime;
    this.parkingSiteId = parkingSiteId;
    this.floorId = floorId;
  }
}