// src/domain/commands/CreateReservationCommand.js

export class CreateReservationCommand {
  /**
   * @param {string} userId - ID ของผู้ใช้ที่ทำการจอง
   * @param {string} slotId - ID ของช่องจอดที่จอง
   * @param {Date} startTime - เวลาเริ่มจอง
   * @param {Date} endTime - เวลาสิ้นสุดจอง
   */
  constructor(userId, slotId, startTime, endTime) {
    // ตรวจสอบข้อมูลทั้งหมดที่จำเป็น
    if (!userId || !slotId || !startTime || !endTime) {
      throw new Error(
        "User ID, Slot ID, Start Time, and End Time are required."
      );
    }

    this.userId = userId;
    this.slotId = slotId;
    this.startTime = startTime;
    this.endTime = endTime;
  }
}
