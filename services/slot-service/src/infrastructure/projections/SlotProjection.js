// /services/slot-service/src/projections/SlotProjection.js

export class SlotProjection {
  constructor(supabaseClient) {
    if (!supabaseClient) {
      throw new Error("SlotProjection requires a Supabase client.");
    }
    this.supabase = supabaseClient;
    this.tableName = "slots"; // ชื่อตาราง Read Model
  }

  /**
   * จัดการ Event การสร้าง Slot
   * @param {object} eventData - ข้อมูลจาก SlotCreatedEvent
   */
  async handleSlotCreated(eventData) {
    try {
      const {
        slotId,         // รหัส 11 หลัก (ใช้เป็น PK)
        name,
        details,
        status,
        parkingSiteId,
        floorId,
        zoneId,         // 👈 รับเพิ่ม (FK ไปตาราง zones)
        slotNumber      // 👈 รับเพิ่ม (เลขลำดับช่องจอด)
      } = eventData;

      console.log(`[SlotProjection] Projecting SlotCreatedEvent: ${slotId}`);

      const { error } = await this.supabase.from(this.tableName).insert({
        id: slotId,                     // 🔑 Primary Key (Text 11 หลัก)
        name: name,
        details: details,
        status: status || "available",
        
        // Foreign Keys & Hierarchy Data
        parking_site_id: parkingSiteId,
        floor_id: floorId,
        zone_id: zoneId,
        slot_number: slotNumber,
        vehicle_type: eventData.vehicleType || "car", 
        vehicle_type_code: eventData.vehicleTypeCode !== undefined ? eventData.vehicleTypeCode : 1, // 👈 บันทึก Vehicle Type Code
        
        version: 1,                     // Version เริ่มต้น
        // updated_at: new Date()       // (Optional) ถ้ามีคอลัมน์นี้
      });

      if (error) {
        // ตรวจสอบ Error เฉพาะเจาะจง (เช่น Foreign Key ไม่เจอ)
        if (error.code === '23503') {
             console.error(`[SlotProjection] Foreign Key Violation: Please ensure Site, Building, Floor, and Zone exist before creating a Slot.`);
        }
        throw error;
      }

      console.log(`[SlotProjection] Successfully projected new slot: ${name} (${slotId})`);
      
    } catch (error) {
      console.error(`[SlotProjection] Error handling SlotCreatedEvent:`, error);
      // โยน Error ต่อเพื่อให้ Consumer รู้ (และอาจทำ Retry/Nack)
      throw error;
    }
  }

  // (ในอนาคต) จัดการเมื่อสถานะ Slot เปลี่ยน
  /*
  async handleSlotStatusUpdated(eventData) {
    const { slotId, newStatus, version } = eventData;
    const { error } = await this.supabase
      .from(this.tableName)
      .update({ status: newStatus, version: version })
      .eq('id', slotId);
    if (error) console.error(...)
  }
  */
}