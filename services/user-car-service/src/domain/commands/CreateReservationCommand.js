// /services/user-car-service/src/domain/commands/CreateReservationCommand.js

export class CreateReservationCommand {
  /**
   * สร้าง Command สำหรับการจองที่จอดรถ (รองรับ Composite Time Format)
   * @param {Object} data - ข้อมูลการจอง
   * @param {string} data.userId - ID ของผู้ใช้
   * @param {string} data.slotId - ID ของช่องเวลา
   * @param {number} data.startTimeStamp - Unix timestamp (seconds) ของเวลาเริ่ม
   * @param {string} data.startDateLocal - วันที่เริ่มในรูปแบบ Local (YYYY-MM-DD)
   * @param {string} data.startTimeLocal - เวลาเริ่มในรูปแบบ Local (HH:mm:ss)
   * @param {number} data.endTimeStamp - Unix timestamp (seconds) ของเวลาสิ้นสุด
   * @param {string} data.endDateLocal - วันที่สิ้นสุดในรูปแบบ Local (YYYY-MM-DD)
   * @param {string} data.endTimeLocal - เวลาสิ้นสุดในรูปแบบ Local (HH:mm:ss)
   * @param {string} data.timeZoneOffset - Offset ของ timezone (เช่น "+07:00")
   * @param {string} data.parkingSiteId - ID ของสถานที่จอดรถ
   * @param {string} data.floorId - ID ของชั้นที่จอดรถ
   */
  constructor(data) {
    // 1. Validation
    if (
      !data.userId ||
      !data.slotId ||
      !data.startDateLocal ||
      !data.startTimeLocal ||
      !data.endDateLocal ||
      !data.endTimeLocal ||
      !data.timeZoneOffset ||
      !data.parkingSiteId ||
      !data.floorId
    ) {
      throw new Error(
        "Missing required fields: userId, slotId, composite time components, parkingSiteId, and floorId"
      );
    }

    // 2. เก็บค่าทั้งหมดเป็น Composite Format
    this.userId = data.userId;
    this.slotId = data.slotId;
    
    // Composite Time Components
    this.startTimeStamp = data.startTimeStamp;
    this.startDateLocal = data.startDateLocal;
    this.startTimeLocal = data.startTimeLocal;
    
    this.endTimeStamp = data.endTimeStamp;
    this.endDateLocal = data.endDateLocal;
    this.endTimeLocal = data.endTimeLocal;
    
    this.timeZoneOffset = data.timeZoneOffset;
    
    this.parkingSiteId = data.parkingSiteId;
    this.floorId = data.floorId;
  }
}